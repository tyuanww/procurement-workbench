import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page, Route } from '../node_modules/.pnpm/node_modules/playwright/index.js';

const sample = new URL('../fixtures/demo/procurement-chase.sql', import.meta.url);
const batch = 'hz09-batch-501';

export function seedChaseSample(): void {
  seedDemoFixture(sample);
}

export function seedDemoFixture(fixture: URL): void {
  const { DATABASE_URL: database, PGBIN: pgBin, E2E_ALLOW_MUTATION: allowed } = process.env;
  assert.equal(allowed, '1');
  assert.ok(database && /^postgresql:\/\/sw_accept@127\.0\.0\.1:\d+\/sw_accept_[0-9a-f]+$/.test(database), '仅在原生验收的临时库建立合成样本');
  const executable = process.platform === 'win32' ? 'psql.exe' : 'psql';
  execFileSync(pgBin === undefined ? executable : join(pgBin, executable), [
    database, '-X', '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(fixture),
  ]);
}

export async function checkChaseToday({ page, origin, out }: {
  readonly page: Page;
  readonly origin: URL;
  readonly out: string;
}) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origin.origin });
  await page.goto(new URL('/today?reasons=unshipped', origin).href);
  const sampleRows = page.locator('.today-row').filter({ hasText: /HZ09-\d{4}/ });
  const order = (po: string) => sampleRows.filter({ hasText: po });
  await order('HZ09-0001').waitFor();
  assert.equal(await sampleRows.count(), 50);
  await page.getByRole('status').filter({ hasText: /共\s*501\s*条.*第\s*1\s*页/ }).waitFor();
  await page.getByTitle('下一页', { exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('page') === '2');
  await page.getByRole('status').filter({ hasText: /共\s*501\s*条.*第\s*2\s*页/ }).waitFor();
  await page.goto(new URL('/today?reasons=unshipped&page=11', origin).href);
  await order('HZ09-0501').waitFor();
  assert.equal(await sampleRows.count(), 1);
  await page.screenshot({ path: join(out, 'procurement-last-page.png'), animations: 'disabled' });

  await page.getByRole('button', { name: /^复制全部催单/ }).click();
  await page.getByRole('status').filter({ hasText: '已复制 501 条催单' }).waitFor();
  const allText = await clipboardText(page);
  assert.deepEqual(purchaseOrders(allText), sampleOrders(501));
  assert.ok(allText.includes('合成催货甲厂') && allText.includes('合成催货乙厂'));
  await page.getByRole('button', { name: '复制合成催货甲厂催单（筛选结果）' }).click();
  await page.getByRole('status').filter({ hasText: '已复制 500 条催单' }).waitFor();
  const factoryText = await clipboardText(page);
  assert.deepEqual(purchaseOrders(factoryText), sampleOrders(501).filter((po) => po !== 'HZ09-0250'));
  assert.ok(factoryText.includes('合成催货甲厂'));
  assert.ok(!factoryText.includes('合成催货乙厂'));

  await page.goto(new URL('/today?drawer=batch%3Ahz09-batch-250', origin).href);
  const restored = page.getByRole('dialog').filter({ hasText: 'HZ09-0250' });
  await restored.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('drawer'), 'batch:hz09-batch-250');

  const bulk = new URL('/today?reasons=unshipped&sort=bulk&unit=%E4%BB%B6', origin).href;
  await page.goto(bulk);
  await order('HZ09-0501').waitFor();
  await order('HZ09-0001').waitFor();
  const sorted = await sampleRows.allTextContents();
  assert.match(sorted[0] ?? '', /HZ09-0501/);
  assert.match(sorted[1] ?? '', /HZ09-0001/);
  assert.equal(await order('HZ09-0002').count(), 0);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: '打开菜单', exact: true }).waitFor();
  await page.getByRole('navigation', { name: '今日快捷入口' }).getByRole('link', { name: /要催货/ }).click();
  assert.ok(await page.getByRole('region', { name: '行动板待办' }).evaluate((list) => list === document.activeElement));
  assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
  await order('HZ09-0501').getByRole('button', { name: '复制本批催单' }).click();
  await page.getByRole('status').filter({ hasText: '已复制 1 条催单' }).waitFor();
  assert.deepEqual(purchaseOrders(await clipboardText(page)), ['HZ09-0501']);
  await page.screenshot({ path: join(out, 'procurement-bulk-mobile.png'), animations: 'disabled' });
  await recordShipment(page, origin, 25_000);
  await page.reload();
  await order('HZ09-0501').getByText(/未发\s+5,000\s+件/).waitFor();
  assert.match((await sampleRows.first().innerText()), /HZ09-0001/);
  const memos = page.locator('section').filter({ has: page.getByRole('heading', { name: '到仓备忘录', exact: true }) }).last();
  await memos.getByText(/待收 25,000 件/).waitFor();
  const scheduled = await recordFollowUp(page, order('HZ09-0501'), '2099-01-11T10:00', '明早十点再联系供应商');
  assert.equal(scheduled.nextFollowUpAt, '2099-01-11T02:00:00.000Z');
  await page.reload();
  await order('HZ09-0501').getByText('下次跟进 · 2099-01-11 10:00', { exact: true }).waitFor();
  await recordShipment(page, origin, 5_000);
  await page.reload();
  await memos.getByText(/待收 30,000 件/).waitFor();
  assert.equal(await order('HZ09-0501').count(), 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: /^复制筛选催单/ }).click();
  await page.getByRole('status').filter({ hasText: '已复制 499 条催单' }).waitFor();
  const after = purchaseOrders(await clipboardText(page));
  assert.deepEqual(after, sampleOrders(501).filter((po) => po !== 'HZ09-0501' && po !== 'HZ09-0002'));
  await page.getByRole('button', { name: /^复制全部催单/ }).click();
  await page.getByRole('status').filter({ hasText: '已复制 500 条催单' }).waitFor();
  assert.deepEqual(purchaseOrders(await clipboardText(page)), sampleOrders(501).filter((po) => po !== 'HZ09-0501'));
  return { total: 501, lastPage: 11, allCopied: 501, factoryCopied: 500, oldDrawerLinkRestored: true, bulkFirst: 'HZ09-0501', batchCopied: 1, remainingAfterPartial: 5_000, inTransitAtEnd: 30_000,
    followUp: await checkFollowUpReminder({ page, origin, row: order('HZ09-0501'), out }),
  };
}

async function recordFollowUp(page: Page, row: Locator, time: string, text: string) {
  await row.getByRole('button', { name: /记跟进/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('内容', { exact: true }).fill(text);
  await dialog.getByLabel('下次跟进时间（选填）', { exact: true }).fill(time);
  const [saved] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/follow-ups' && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: /^确\s*认$/ }).click(),
  ]);
  assert.equal(saved.status(), 200);
  await dialog.waitFor({ state: 'hidden' });
  return saved.json();
}

export async function checkKeyboardReceipt({ page, origin, out }: {
  readonly page: Page;
  readonly origin: URL;
  readonly out: string;
}) {
  const today = new URL('/today?reasons=follow_up_due', origin);
  const row = page.getByRole('button', { name: /^查看详情 HZ09-0501/ });
  const memo = page.locator('section').filter({ has: page.getByRole('heading', { name: '到仓备忘录', exact: true }) }).last();
  const batchLink = memo.getByRole('link', { name: /HZ09-0501/ });
  const partial = '合成收货单 A · 第一车';
  const remaining = '合成收货单 B · 第二车';
  await page.goto(today.href);
  await row.waitFor();
  await batchLink.waitFor();
  await recordKeyboardReceipt(page, { before: 30_000, recv: 12_000, evidence: partial });
  await page.reload();
  await memo.getByText(/待收 18,000 件 · 实收 12,000 件/).waitFor();
  await batchLink.click();
  await page.getByText('未发 0 件 · 待收 18,000 件 · 实收 12,000 件', { exact: true }).waitFor();
  await page.getByText(/实收登记.*12,000 件.*合成收货单 A/).waitFor();
  await page.screenshot({ path: join(out, 'procurement-partial-receipt.png'), animations: 'disabled' });

  await page.goto(today.href);
  await row.waitFor();
  await recordKeyboardReceipt(page, { before: 18_000, recv: 18_000, evidence: remaining });
  await page.reload();
  await page.getByRole('status').filter({ hasText: /共 \d+ 条 · 第 1 页/ }).waitFor();
  assert.equal(await batchLink.count(), 0);
  await page.goto(new URL('/lines/hz09-line-501?focusBatch=' + batch, origin).href);
  await page.getByText('未发 0 件 · 待收 0 件 · 实收 30,000 件', { exact: true }).waitFor();
  await page.getByText(/实收登记.*18,000 件.*合成收货单 B/).waitFor();
  return { po: 'HZ09-0501', keyboard: ['ArrowDown', 'r'], received: [12_000, 30_000], inTransit: [18_000, 0], evidence: [partial, remaining] };
}

async function recordKeyboardReceipt(page: Page, { before, recv, evidence }: { readonly before: number; readonly recv: number; readonly evidence: string }) {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('r');
  const dialog = page.getByRole('dialog');
  const qty = dialog.getByRole('spinbutton', { name: '数量', exact: true });
  await qty.waitFor();
  await page.waitForURL((url) => url.searchParams.get('drawer') === 'batch:' + batch && url.searchParams.get('draft') === 'receipt');
  assert.equal(Number(await qty.inputValue()), before);
  await qty.fill(String(recv));
  await dialog.getByLabel('收货日', { exact: true }).fill('2025-02-02');
  await dialog.getByLabel('收货及归批依据', { exact: true }).fill(evidence);
  const refreshPath = /\/api\/v1\/today\?/;
  const refreshGate = Promise.withResolvers<void>();
  const delayRefresh = async (route: Route) => { await refreshGate.promise; await route.continue(); };
  await page.route(refreshPath, delayRefresh);
  try {
    const saved = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/v1/batches/' + batch + '/receipts'
      && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: /^确\s*认$/ }).press('Enter');
    assert.equal((await saved).status(), 200);
    await page.waitForURL((url) => !url.searchParams.has('drawer') && !url.searchParams.has('draft'));
  } finally {
    refreshGate.resolve();
    await page.unroute(refreshPath, delayRefresh);
  }
  await dialog.waitFor({ state: 'hidden' });
}

async function checkFollowUpReminder({ page, origin, row, out }: {
  readonly page: Page;
  readonly origin: URL;
  readonly row: Locator;
  readonly out: string;
}) {
  const shortcuts = page.getByRole('navigation', { name: '今日快捷入口', exact: true });
  const scheduled = shortcuts.getByRole('button', { name: '已约跟进 1 批', exact: true });
  const due = shortcuts.getByRole('button', { name: '到时跟进 1 批', exact: true });
  await scheduled.click();
  await page.waitForURL((url) => url.searchParams.get('reasons') === 'follow_up_scheduled' && !url.searchParams.has('unit'));
  await row.getByText('下次跟进 · 2099-01-11 10:00', { exact: true }).waitFor();
  assert.equal(await page.locator('.today-row').count(), 1);
  await page.screenshot({ path: join(out, 'procurement-follow-up-scheduled.png'), animations: 'disabled' });

  const changed = await recordFollowUp(page, row, '2025-02-01T10:00', '改期，跟进收货进度');
  assert.equal(changed.nextFollowUpAt, '2025-02-01T02:00:00.000Z');
  await due.click();
  await page.waitForURL((url) => url.searchParams.get('reasons') === 'follow_up_due');
  const dueTime = row.getByText('下次跟进 · 2025-02-01 10:00', { exact: true });
  await dueTime.waitFor();
  await row.getByText('已全发 · 在途待收 30,000 件', { exact: true }).waitFor();
  assert.equal(await row.getByRole('button', { name: '复制本批催单' }).count(), 0);
  await page.screenshot({ path: join(out, 'procurement-follow-up-due.png'), animations: 'disabled' });
  await page.reload();
  await dueTime.waitFor();

  const cleared = await recordFollowUp(page, row, '', '跟进完成，取消提醒');
  assert.equal(cleared.nextFollowUpAt, null);
  await due.waitFor({ state: 'hidden' });
  await row.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /^撤\s*销$/ }).click();
  await dueTime.waitFor();
  await page.screenshot({ path: join(out, 'procurement-follow-up-undo.png'), animations: 'disabled' });
  await page.goto(new URL('/lines/hz09-line-501', origin).href);
  await page.getByRole('heading', { name: '时间线', exact: true }).waitFor();
  await page.getByText('下次跟进 · 2025-02-01 10:00', { exact: true }).waitFor();
  return { scheduledAt: '2099-01-11T02:00:00.000Z', changedAt: changed.nextFollowUpAt, clear: cleared.nextFollowUpAt, undo: true, timeline: true, fullShipmentStillInTransit: true };
}

export async function checkFirstBatch({ page, origin, buyer, warehouse }: {
  readonly page: Page;
  readonly origin: URL;
  readonly buyer: string;
  readonly warehouse: string;
}) {
  const line = await page.request.post(new URL('/api/v1/lines', origin).href, {
    data: { nameRaw: '合成待建首批', lane: 'finished', poRaw: 'SYNTHETIC-FIRST-BATCH', qtyOrdered: 120, unit: '件', receiverPartyId: warehouse, buyerUserId: buyer },
  });
  assert.ok(line.ok());
  const { line: { id } } = await line.json();
  assert.equal(typeof id, 'string');
  await page.goto(new URL('/today', origin).href);
  const pending = page.locator('section').filter({ has: page.getByRole('heading', { name: '待建批次', exact: true }) }).last();
  const link = pending.getByRole('link', { name: '查看订单', exact: true }).and(pending.locator('a[href="/lines/' + encodeURIComponent(id) + '"]'));
  await link.waitFor();
  await link.locator('..').getByRole('button', { name: '生成首批次', exact: true }).click();
  await pending.getByRole('status').filter({ hasText: '已生成首批次' }).waitFor();
  await link.waitFor({ state: 'hidden' });
  const detail = await page.request.get(new URL('/api/v1/lines/' + encodeURIComponent(id), origin).href);
  assert.ok(detail.ok());
  const { batches } = await detail.json();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].plannedQty, 120);
  return { pendingBefore: 1, pendingAfter: 0, created: batches.length };
}

function sampleOrders(count: number): string[] {
  return Array.from({ length: count }, (_, index) => 'HZ09-' + String(index + 1).padStart(4, '0'));
}

function purchaseOrders(text: string): string[] {
  return (text.match(/\bHZ09-\d{4}\b/g) ?? []).sort();
}

async function clipboardText(page: Page): Promise<string> {
  return page.evaluate(() => globalThis.navigator.clipboard.readText());
}

async function recordShipment(page: Page, origin: URL, qty: number): Promise<void> {
  const response = await page.request.post(new URL('/api/v1/batches/' + batch + '/shipments', origin).href, {
    data: { qty, shippedOn: '2025-02-01', fulfillment: { kind: 'verified', unit: '件', evidence: '原生验收合成发货凭据' } },
  });
  assert.ok(response.ok(), '合成发货 HTTP ' + response.status());
}

export async function checkTodayDrawer(page: Page, origin: URL) {
  const listUrl = new URL('/today?reasons=unshipped&page=11', origin);
  const detailUrl = new URL(listUrl);
  detailUrl.searchParams.set('drawer', 'batch:' + batch);
  const detail = page.getByRole('button', { name: /^查看详情 HZ09-0501/ });
  const dialog = page.getByRole('dialog');
  const close = dialog.getByRole('button', { name: '关闭', exact: true });

  await page.goto(listUrl.href);
  await detail.focus();
  await page.keyboard.press('Enter');
  await dialog.getByText(/HZ09-0501/).waitFor();
  await page.waitForURL(detailUrl.href);
  await page.keyboard.press('Escape');
  await page.waitForURL(listUrl.href);
  await dialog.waitFor({ state: 'hidden' });
  await page.goBack();
  assert.equal(page.url(), detailUrl.href);
  await dialog.getByText(/HZ09-0501/).waitFor();
  await page.goForward();
  assert.equal(page.url(), listUrl.href);
  await dialog.waitFor({ state: 'hidden' });

  for (let attempt = 0; attempt < 3; attempt++) {
    await detail.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForURL(listUrl.href);
  }

  await page.reload();
  await page.getByRole('status').filter({ hasText: /共\s*501\s*条.*第\s*11\s*页/ }).waitFor();
  await detail.waitFor();
  assert.equal(page.url(), listUrl.href);
  assert.equal(await dialog.isVisible(), false);

  const draftUrl = new URL(detailUrl);
  draftUrl.searchParams.set('draft', 'date');
  await page.goto(draftUrl.href);
  const date = dialog.getByRole('textbox', { name: '确认日', exact: true });
  await date.waitFor();
  assert.equal(await date.inputValue(), '2025-02-01');
  await close.focus();
  await page.keyboard.press('Escape');
  await page.waitForURL(detailUrl.href);
  await date.waitFor({ state: 'hidden' });
  await close.click();
  await page.waitForURL(listUrl.href);
  await dialog.waitFor({ state: 'hidden' });
  return { settledEscape: true, browserHistoryRestored: true, quickEscapes: 3, filterOnReload: 'unshipped', pageOnReload: 11, draftLinkRestored: true, draftEscape: true, mouseClose: true };
}
