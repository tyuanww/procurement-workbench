import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { URLSearchParams } from 'node:url';
import type { Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { seedDemoFixture } from './procurement-today-acceptance.ts';

const requireWeb = createRequire(new URL('../packages/report-renderers/package.json', import.meta.url));
const xlsx: typeof import('../node_modules/.pnpm/node_modules/xlsx/types/index.js') = requireWeb('xlsx');
const scopeId = 'scope-import-current';
const currentStore = 'dafuyan';
const storeOrderPos = ['FS-MANUAL', 'FS-MATCHED'];
const currentFactoryOrderPos = [...storeOrderPos, 'FS-YILING'];
const sourceName = '核对本次导入来源';
const destinationName = '查看本次实际关联的订单';

export async function checkFactoryImportScope({ buyer, manager, origin }: {
  readonly buyer: Page; readonly manager: Page; readonly origin: URL;
}) {
  seedDemoFixture(new URL('../fixtures/demo/factory-import-scope.sql', import.meta.url));
  await buyer.setViewportSize({ width: 1440, height: 900 });
  await manager.setViewportSize({ width: 1440, height: 900 });
  await assertFactoryScopeApi({ page: buyer, origin, id: scopeId, expected: currentFactoryOrderPos });
  await assertFactoryScopeApi({ page: buyer, origin, id: 'scope-import-other-batch', expected: ['FS-OTHER-BATCH'] });
  await assertFactoryScopeApi({ page: buyer, origin, id: 'scope-import-other-factory', expected: ['FS-OTHER-FACTORY'] });
  await assertFactoryScopeApi({ page: buyer, origin, id: scopeId, expected: ['FS-YILING'], store: 'yiling' });
  const shared = await checkFactorySourceRoundTrip(buyer, origin);
  await checkEmptyFactorySource(buyer, origin);
  const denied = await manager.request.get(new URL(`/api/v1/imports/${scopeId}`, origin).href);
  assert.equal(denied.status(), 403);
  await manager.goto(shared.href);
  await assertFactoryScopeRows(manager);
  assert.equal(await manager.getByRole('link', { name: '返回导入批次', exact: true }).count(), 0);
  return { associatedOrders: currentFactoryOrderPos, scopedOrders: storeOrderPos, exportMatches: true,
    emptyHasNoLink: true, returnFocus: true, managerImportStatus: denied.status(), sharedOrdersMatch: true };
}

async function assertFactoryScopeApi({ page, origin, id, expected, store }: {
  readonly page: Page; readonly origin: URL; readonly id: string; readonly expected: readonly string[]; readonly store?: string;
}) {
  const query = new URLSearchParams({ importBatchId: id });
  if (store !== undefined) query.set('store', store);
  const response = await page.request.get(new URL(`/api/v1/lines?${query}`, origin).href);
  assert.ok(response.ok(), await response.text());
  const { items, page: pagination }: { items: readonly { po: { poRaw: string } }[]; page: { total: number } } = await response.json();
  assert.equal(pagination.total, expected.length);
  assert.deepEqual(items.map((row) => row.po.poRaw).sort(), expected);
}

async function checkFactorySourceRoundTrip(page: Page, origin: URL) {
  const history = new URL(`/imports?template=factory-progress-v1&status=committed&store=${currentStore}`, origin);
  await page.goto(history.href);
  const batch = page.getByRole('link', { name: 'scope-file-current', exact: true });
  await batch.press('Enter');
  await page.waitForURL((url) => url.pathname === `/imports/${scopeId}`);
  const trigger = page.getByRole('button', { name: sourceName, exact: true });
  const [lookup] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/lines' && url.searchParams.get('pageSize') === '1';
    }),
    trigger.press('Enter'),
  ]);
  const query = new URL(lookup.url()).searchParams;
  assert.equal(query.get('importBatchId'), scopeId);
  assert.equal(query.get('store'), currentStore);
  assert.ok(lookup.ok());
  const drawer = page.getByRole('dialog', { name: sourceName, exact: true });
  await drawer.getByText('本次导入关联 2 条可查看的订单行。', { exact: true }).waitFor();
  await drawer.getByText('合成导入甲厂', { exact: true }).waitFor();
  const sourceUrl = page.url();
  assert.equal(new URL(sourceUrl).pathname, `/imports/${scopeId}`);
  const orderLink = drawer.getByRole('link', { name: destinationName, exact: true });
  const shared = new URL(await orderLink.getAttribute('href') ?? '', origin);
  await orderLink.press('Enter');
  await page.waitForURL(shared.href);
  await assertFactoryScopeRows(page);
  const [filtered] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/lines' && url.searchParams.get('stages') === 'no_batch';
    }),
    page.getByRole('radiogroup', { name: '常用视图' }).getByText('未建要货', { exact: true }).click(),
  ]);
  assert.ok(filtered.ok());
  await page.waitForURL((url) => url.searchParams.get('view') === 'no-batch');
  await assertFactoryScopeRows(page);
  await assertFactoryScopeExport(page, origin);
  await page.getByRole('link', { name: '返回导入批次', exact: true }).press('Enter');
  await page.waitForURL(sourceUrl);
  await orderLink.and(page.locator(':focus')).waitFor();
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await trigger.and(page.locator(':focus')).waitFor();
  await page.getByRole('link', { name: '返回导入中心', exact: true }).press('Enter');
  await page.waitForURL(history.href);
  await batch.and(page.locator(':focus')).waitFor();
  return shared;
}

async function assertFactoryScopeRows(page: Page) {
  const rows = page.getByRole('region', { name: '订单查询结果', exact: true });
  await rows.getByRole('link', { name: 'FS-MANUAL', exact: true }).waitFor();
  assert.deepEqual((await rows.locator('th[scope="row"] a').allTextContents()).sort(), storeOrderPos);
}

async function assertFactoryScopeExport(page: Page, origin: URL) {
  const href = await page.getByRole('link', { name: '导出 Excel', exact: true }).getAttribute('href');
  const address = new URL(href ?? '', origin);
  assert.equal(address.searchParams.get('importBatchId'), scopeId);
  assert.equal(address.searchParams.get('store'), currentStore);
  assert.equal(address.searchParams.get('stages'), 'no_batch');
  const response = await page.request.get(address.href);
  assert.ok(response.ok());
  const book = xlsx.read(await response.body());
  const rows = xlsx.utils.sheet_to_json<string[]>(book.Sheets['订单行'], { header: 1 }).slice(1);
  assert.deepEqual(rows.map((row) => row[0]).sort(), storeOrderPos);
}

async function checkEmptyFactorySource(page: Page, origin: URL) {
  await page.goto(new URL('/imports?template=factory-progress-v1&status=committed', origin).href);
  await page.getByRole('link', { name: 'scope-file-empty', exact: true }).press('Enter');
  await page.getByRole('button', { name: sourceName, exact: true }).press('Enter');
  const drawer = page.getByRole('dialog', { name: sourceName, exact: true });
  await drawer.getByText('当前范围没有可查看的关联记录。', { exact: true }).waitFor();
  assert.equal(await drawer.getByRole('link', { name: destinationName, exact: true }).count(), 0);
  assert.equal(new URL(page.url()).pathname, '/imports/scope-import-empty');
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
}
