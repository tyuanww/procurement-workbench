import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';

const legacyPath = '/master?tab=unlinked';
const current = '工厂待处理';
const active = '当前关联诊断';
const historical = '历史关联诊断';
const reportPath = '/api/v1/factory-reports';
const factoryPath = '/api/v1/factory-links';

export async function checkFactoryLinkBoard({ reviewer, openAdmin, origin, out }: {
  readonly reviewer: Page;
  readonly openAdmin: () => Promise<Page>;
  readonly origin: URL;
  readonly out: string;
}) {
  seedFactoryRows();
  const linkFor = (name: string) => reviewer.locator('aside').getByRole('link', { name, exact: true });
  const currentPanel = reviewer.getByRole('main');
  const currentPage1 = await readPage(reviewer, current, 1, async () => { await reviewer.goto(new URL(legacyPath, origin).href); });
  await currentPanel.getByText('共 22 条', { exact: true }).waitFor();
  assert.equal(await linkFor(current).getAttribute('aria-current'), 'page');
  assert.equal(await currentPanel.getByRole('tab').count(), 0);
  assert.equal(await currentPanel.getByRole('button', { name: '建成订单行', exact: true }).count(), 0);

  const search = currentPanel.getByLabel('筛选本页表名或行号', { exact: true });
  await search.fill('121');
  await currentPanel.getByText('本页没有符合筛选条件的上报。', { exact: true }).waitFor();
  await currentPanel.getByText('共 22 条', { exact: true }).waitFor();
  const currentPage2 = await goToNextPage(reviewer, current);
  const link = currentPanel.getByRole('button', { name: /^挂\s*接$/ });
  await currentPanel.getByText('SC06 在途 第 121 行', { exact: true }).waitFor();
  assert.equal(await link.count(), 1);
  assert.equal(await link.isDisabled(), true);

  const activePage1 = await readPage(reviewer, active, 1, () => linkFor(active).click());
  await currentPanel.getByText('共 21 条', { exact: true }).waitFor();
  const activePage2 = await goToNextPage(reviewer, active);
  await reviewer.getByText('品号 SC06-CURRENT-21', { exact: false }).waitFor();
  const historicalPage1 = await readPage(reviewer, historical, 1, () => linkFor(historical).click());
  await currentPanel.getByText('共 21 条', { exact: true }).waitFor();
  const historicalPage2 = await goToNextPage(reviewer, historical);
  await reviewer.getByText('单号 SC06-HISTORY-21', { exact: false }).waitFor();
  const keys = [...currentPage1, ...currentPage2, ...activePage1, ...activePage2, ...historicalPage1, ...historicalPage2];
  assert.equal(keys.length, 64);
  assert.equal(new Set(keys).size, 64, '三个范围中的工厂行只能出现一次');
  await reviewer.screenshot({ path: join(out, 'factory-link-history.png'), animations: 'disabled' });

  await linkFor(current).click();
  await currentPanel.getByText('共 22 条', { exact: true }).waitFor();
  await goToNextPage(reviewer, current);
  await search.fill('121');
  await currentPanel.getByLabel('订单行编号', { exact: true }).fill('hz09-line-1');
  const [linked] = await Promise.all([
    post(reviewer, `${reportPath}/in-transit/sc06-active-121/link`, () => link.click()),
    readPage(reviewer, current, 1),
  ]);
  assert.equal(linked.linkStatus, 'manual');
  assert.equal(linked.linkedOrderLineId, 'hz09-line-1');
  await currentPanel.getByText('共 21 条', { exact: true }).waitFor();
  await search.fill('');
  await currentPanel.getByText('SC06 在途 第 101 行', { exact: true }).waitFor();
  assert.equal(await currentPanel.getByText('SC06 在途 第 121 行', { exact: true }).count(), 0);

  const admin = await openAdmin();
  const adminPanel = admin.getByRole('main');
  await adminPanel.getByText('共 21 条', { exact: true }).waitFor();
  await adminPanel.getByLabel('筛选本页表名或行号', { exact: true }).fill('120');
  const [created] = await Promise.all([
    post(admin, `${reportPath}/in-transit/sc06-active-120/create-line`, () => adminPanel.getByRole('button', { name: '建成订单行', exact: true }).click()),
    readPage(admin, current, 1),
  ]);
  assert.equal(created.line.nameRaw, 'SC06 合成在途 120');
  await adminPanel.getByText('共 20 条', { exact: true }).waitFor();
  await adminPanel.getByText('本页没有符合筛选条件的上报。', { exact: true }).waitFor();

  await confirmAction(admin, '重跑排产关联', '确认重跑', 'relink-schedule', /^已重跑排产关联.*排产格 1 条/);
  await confirmAction(admin, '重跑工厂关联', '确认重跑', 'relink', /^已重跑工厂关联/);
  const backfill = (updated: number) => confirmAction(admin, '回填供应商主体', '确认回填', 'backfill-suppliers', new RegExp(`^已回填 ${updated} 条采购单`));
  assert.deepEqual(await backfill(1), { updated: 1 });
  assert.equal(queryAcceptanceDb(`SELECT supplier_party_id FROM purchase_orders WHERE id = 'sc06-backfill-po';`).trim(), 'sc06-supplier');
  assert.deepEqual(await backfill(0), { updated: 0 });
  await adminPanel.getByText('共 20 条', { exact: true }).waitFor();
  await adminPanel.getByLabel('筛选本页表名或行号', { exact: true }).fill('');
  await admin.screenshot({ path: join(out, 'factory-link-board.png'), animations: 'disabled' });
  return { legacyPath, scopeTotals: [22, 21, 21], uniqueRows: keys.length, linked: linked.linkedOrderLineId, created: created.line.id, remaining: 20, bulkActions: 3, backfillUpdated: 1 };
}

async function goToNextPage(page: Page, scope: string): Promise<readonly string[]> {
  const next = page.getByRole('main').getByTitle('下一页', { exact: true });
  return readPage(page, scope, 2, () => next.click());
}

async function readPage(page: Page, scope: string, number: number, trigger?: () => Promise<void>): Promise<readonly string[]> {
  const diagnosticScope = scope === active ? 'active' : 'historical';
  const [response] = await Promise.all([page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.searchParams.get('page') === String(number) && url.searchParams.get('pageSize') === '20' && (scope === current
      ? url.pathname === `${reportPath}/unlinked`
      : url.pathname === `${factoryPath}/unmatched` && url.searchParams.get('scope') === diagnosticScope);
  }), trigger?.()]);
  assert.equal(response.status(), 200);
  const result = await response.json();
  assert.equal(result.page.page, number);
  return result.items.map((item: { readonly kind: string; readonly rowId?: string; readonly id?: string }) => `${item.kind}:${item.rowId ?? item.id}`);
}

async function post(page: Page, path: string, trigger: () => Promise<void>) {
  const [response] = await Promise.all([page.waitForResponse((candidate) =>
    new URL(candidate.url()).pathname === path && candidate.request().method() === 'POST'), trigger()]);
  assert.equal(response.status(), 200, `${path} ${await response.text()}`);
  return response.json();
}

async function confirmAction(page: Page, label: string, confirm: string, endpoint: string, notice: RegExp) {
  await page.getByRole('button').filter({ has: page.getByText(label, { exact: true }) }).click();
  const prompt = page.locator('.ant-popconfirm').filter({ has: page.getByText(`确认${label}？`, { exact: true }) });
  const result = await post(page, `${factoryPath}/${endpoint}`, () => prompt.getByRole('button', { name: confirm, exact: true }).click());
  await prompt.waitFor({ state: 'hidden' });
  await page.getByText(notice).waitFor();
  return result;
}

function seedFactoryRows(): void {
  queryAcceptanceDb(`
    BEGIN;
    INSERT INTO parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse)
    VALUES ('sc06-supplier', now(), now(), 'SC06 合成供应商', true, false, false);
    INSERT INTO party_aliases (id, created_at, updated_at, raw_name, norm_name, party_id, status, seen_count, reviewed_by, reviewed_at)
    VALUES ('sc06-alias', now(), now(), 'SC06 供应商别名', 'SC06 供应商别名', 'sc06-supplier', 'approved', 1,
      '0199f0a0-0000-7000-8000-000000000001', now());
    INSERT INTO purchase_orders (id, created_at, updated_at, po_raw, po_norm, po_format, related_po_raws, supplier_raw, lane)
    VALUES ('sc06-backfill-po', now(), now(), 'SC06-PO', 'SC06-PO', 'OTHER', '{}', ' SC06 供应商别名 ', 'finished');
    INSERT INTO import_batches (id, created_at, updated_at, file_id, template, factory_party_id, status, source_key, superseded_at,
      file_meta, stats, decisions, created_by, committed_by, committed_at)
    SELECT 'sc06-' || phase, now(), now(), 'sc06-file-' || phase, 'factory-progress-v1', 'hz09-factory-a', 'committed', 'sc06-source',
      CASE WHEN phase = 'historical' THEN now() END, '{}', '{}', '{}', '0199f0a0-0000-7000-8000-000000000001',
      '0199f0a0-0000-7000-8000-000000000001', now() FROM (VALUES ('active'), ('historical')) AS snapshot(phase);
    INSERT INTO factory_in_transit_rows (id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint, link_status,
      created_at, updated_at, po_raw, po_norm, name_raw, qty_required)
    SELECT 'sc06-active-' || row_no, 'sc06-active', 'hz09-factory-a', 'SC06 在途', row_no, '{}'::jsonb, 'sc06-fp-' || row_no, 'unlinked', now(), now(),
      'SC06-ACTIVE-' || row_no, 'SC06-ACTIVE-' || row_no, 'SC06 合成在途 ' || row_no, 12 FROM generate_series(101, 121) AS row_no
    UNION ALL
    SELECT 'sc06-history-' || lpad(row_no::text, 2, '0'), 'sc06-historical', 'hz09-factory-a', 'SC06 历史', row_no, '{}'::jsonb, 'sc06-history-fp-' || row_no,
      'unlinked', now(), now(), 'SC06-HISTORY-' || row_no, 'SC06-HISTORY-' || row_no, 'SC06 合成历史 ' || row_no, 12 FROM generate_series(1, 21) AS row_no;
    INSERT INTO customer_supplied_receipt_rows (id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint, link_status,
      created_at, updated_at, item_code_raw)
    SELECT 'sc06-current-' || lpad(row_no::text, 2, '0'), 'sc06-active', 'hz09-factory-a', 'SC06 客供', row_no,
      jsonb_build_object('itemCodeRaw', jsonb_build_object('value', 'SC06-CURRENT-' || row_no)), 'sc06-current-fp-' || row_no,
      'unlinked', now(), now(), 'SC06-CURRENT-' || row_no FROM generate_series(1, 21) AS row_no;
    INSERT INTO factory_schedule_cells (id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint, link_status,
      created_at, updated_at, day, qty)
    VALUES ('sc06-schedule', 'sc06-active', 'hz09-factory-a', 'SC06 排产', 1, '{"day":"2026-11-20","qty":10}',
      'sc06-schedule-fp', 'unlinked', now(), now(), '2026-11-20', 10);
    COMMIT;
  `);
}

function queryAcceptanceDb(input: string): string {
  const { DATABASE_URL: database, PGBIN: pgBin, E2E_ALLOW_MUTATION: allowed } = process.env;
  assert.equal(allowed, '1');
  assert.ok(database && /^postgresql:\/\/sw_accept@127\.0\.0\.1:\d+\/sw_accept_[0-9a-f]+$/.test(database), '仅可使用浏览器验收临时库');
  const executable = process.platform === 'win32' ? 'psql.exe' : 'psql';
  return execFileSync(pgBin === undefined ? executable : join(pgBin, executable), [database, '-XqAt', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8' });
}
