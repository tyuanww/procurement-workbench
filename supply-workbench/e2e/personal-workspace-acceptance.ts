import assert from 'node:assert/strict';
import type { Page, Response } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { sidebarLink } from './sidebar.ts';

const workspace = '/today';
const lineId = 'hz09-line-1';
const batchId = 'hz09-batch-1';
const note = '个人工作台合成验收：明早核对发货安排';
const followUpTime = '2099-01-12T10:00';

type ReceiptFailure = (path: string) => void;

export async function checkPersonalWorkspace(input: {
  readonly buyer: Page;
  readonly peer: Page;
  readonly origin: URL;
  readonly expectReceiptFailure?: ReceiptFailure | undefined;
}) {
  const { buyer, peer, origin } = input;
  const buyerMain = buyer.getByRole('main');
  const peerMain = peer.getByRole('main');
  const menu = buyer.locator('aside');
  const workspaceLink = await sidebarLink(menu, '今日事项', '个人工作台');
  assert.equal(await workspaceLink.count(), 1);
  assert.equal(await menu.getByRole('link', { name: '行动板', exact: true }).count(), 0);
  await workspaceLink.click();
  await buyer.waitForURL((url) => url.pathname === workspace);
  await buyerMain.getByRole('heading', { name: '个人工作台', exact: true }).waitFor({ state: 'attached' });
  const opening = buyerMain.getByRole('button', { name: /^查看详情 HZ09-0001/ });
  await opening.waitFor();
  await peer.goto(new URL(workspace, origin).href);
  await peerMain.getByRole('article', { name: /^HZ09-0502/ }).waitFor();
  assert.equal(await peerMain.getByRole('article', { name: /^HZ09-0001/ }).count(), 0);
  assert.equal(await buyerMain.getByRole('article', { name: /^HZ09-0502/ }).count(), 0);

  const before = await fulfillment({ page: buyer, origin });
  assert.equal(before.unshippedQty, 10_000);
  await opening.click();
  const drawer = buyer.getByRole('dialog');
  await drawer.getByText(/HZ09-0001/).first().waitFor();
  await drawer.getByRole('button', { name: /记跟进$/ }).click();
  await drawer.getByLabel('内容', { exact: true }).fill(note);
  await drawer.getByLabel('下次跟进时间（选填）', { exact: true }).fill(followUpTime);
  const [saved] = await Promise.all([
    buyer.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/follow-ups'),
    drawer.getByRole('button', { name: /^确\s*认$/ }).click(),
  ]);
  assert.equal(saved.status(), 200);
  const record: unknown = await saved.json();
  assert.ok(isObject(record));
  assert.equal(record.batchId, batchId);
  assert.equal(record.nextFollowUpAt, '2099-01-12T02:00:00.000Z');
  await drawer.waitFor({ state: 'hidden' });
  await buyer.waitForURL((url) => url.pathname === workspace && url.searchParams.get('inbox') === 'scheduled');
  const scheduled = buyerMain.getByRole('heading', { name: /^已约跟进/ });
  await scheduled.waitFor();
  await buyerMain.getByText(/2099-01-12 10:00/).first().waitFor();
  await buyer.reload();
  await scheduled.waitFor();
  await buyerMain.getByText(/2099-01-12 10:00/).first().waitFor();
  const scheduledCount = await scheduled.innerText();
  assert.deepEqual(await fulfillment({ page: buyer, origin }), before);

  const legacy = new URL('/today/personal', origin);
  legacy.searchParams.set('scope', 'scheduled');
  legacy.searchParams.set('focus', 'batch:' + batchId);
  await buyer.goto(legacy.href);
  await buyer.waitForURL((url) => url.pathname === workspace && url.searchParams.get('inbox') === 'scheduled'
    && url.searchParams.get('focusId') === 'batch:' + batchId);
  const card = buyerMain.getByRole('article', { name: /^HZ09-0001/ });
  await card.waitFor();
  assert.equal(await card.count(), 1);
  await buyerMain.getByRole('listitem').filter({ has: buyer.getByRole('article', { name: /^HZ09-0001/ }) }).and(buyer.locator(':focus')).waitFor();
  await peer.goto(legacy.href);
  await peerMain.getByText('暂无已约跟进', { exact: true }).waitFor();
  assert.equal(await peerMain.getByText(/HZ09-0001/).count(), 0);

  const receipt = await checkScheduledReceipt({ buyer, origin, expectReceiptFailure: input.expectReceiptFailure });
  assert.equal(await scheduled.innerText(), scheduledCount);
  return { ownerIsolation: true, batchId, nextFollowUpAt: record.nextFollowUpAt, fulfillmentUnchanged: true, legacyFocus: true, receipt };
}

async function checkScheduledReceipt({ buyer, origin, expectReceiptFailure }: {
  readonly buyer: Page;
  readonly origin: URL;
  readonly expectReceiptFailure: ReceiptFailure | undefined;
}) {
  const batchPath = '/api/v1/batches/' + batchId;
  const shipped = await buyer.request.post(new URL(batchPath + '/shipments', origin).href, {
    data: { qty: 4_000, shippedOn: '2025-01-01', fulfillment: { kind: 'verified', unit: '件', evidence: '合成验收·货物交运' } },
  });
  assert.equal(shipped.status(), 200);
  const received = await buyer.request.post(new URL(batchPath + '/receipts', origin).href, {
    data: { qty: 1_000, receivedOn: '2025-01-02', category: 'finished',
      fulfillment: { kind: 'received', unit: '件', disposition: 'normal', evidence: '合成验收·首车签收' } },
  });
  assert.equal(received.status(), 200);

  const today = new URL(workspace, origin);
  today.searchParams.set('reasons', 'shipped_not_received');
  await buyer.goto(today.href);
  const card = buyer.getByRole('main').getByRole('article', { name: /^HZ09-0001/ });
  const receipt = card.getByRole('link', { name: /^核对收货 HZ09-0001/ });
  await receipt.waitFor();
  assert.equal(await card.count(), 1);
  assert.equal(await card.getByRole('button', { name: '复制本批催单' }).count(), 0);
  const target = new URL(await receipt.getAttribute('href') ?? '', origin);
  assert.equal(target.pathname, '/lines/' + lineId);
  assert.equal(target.searchParams.get('focusBatch'), batchId);
  await card.getByRole('button', { name: /^查看详情 HZ09-0001/ }).click();
  const detail = buyer.getByRole('dialog');
  await detail.getByText(/收货方 ·/).waitFor();
  const checkReceipt = detail.getByRole('link', { name: /^核对收货 HZ09-0001/ });
  assert.match(await checkReceipt.getAttribute('class') ?? '', /\bant-btn-variant-outlined\b/);
  assert.match(await detail.getByRole('button', { name: '登记发货', exact: true }).getAttribute('class') ?? '', /\bant-btn-variant-text\b/);
  await buyer.waitForURL((url) => url.searchParams.get('drawer') === 'batch:' + batchId);
  await checkReceipt.click();
  await buyer.waitForURL(target.href);
  const batches = buyer.getByRole('region', { name: '批次', exact: true });
  await batches.getByText('未发 6,000 件 · 待收 3,000 件 · 实收 1,000 件', { exact: true }).waitFor();
  await batches.getByRole('button', { name: '登记收货', exact: true }).click();
  const receiptUrl = new URL(batchPath + '/receipts', origin);
  expectReceiptFailure?.(receiptUrl.pathname);
  await checkReceiptRetry(buyer, receiptUrl);
  await batches.getByText('未发 6,000 件 · 待收 2,250 件 · 实收 1,750 件', { exact: true }).waitFor();
  await buyer.getByRole('link', { name: '返回个人工作台', exact: true }).click();
  await buyer.waitForURL(today.href);
  await receipt.and(buyer.locator(':focus')).waitFor();
  await buyer.getByRole('button', { name: /切换工作范围$/u }).click();
  await buyer.getByRole('menuitem', { name: /^已约跟进/ }).click();
  await card.getByText('下次跟进 · 2099-01-12 10:00', { exact: true }).waitFor();
  assert.equal(await card.getByRole('button', { name: '复制本批催单' }).count(), 0);
  return { unshipped: 6_000, inTransit: 2_250, received: 1_750, reminderRetainedAfterReceipt: true, receiptRetryPreserved: true };
}

async function checkReceiptRetry(buyer: Page, url: URL) {
  const dialog = buyer.getByRole('dialog', { name: '登记收货', exact: true });
  const quantity = dialog.getByRole('spinbutton', { name: '数量', exact: true });
  const date = dialog.getByLabel('收货日', { exact: true });
  const evidence = dialog.getByLabel('收货及归批依据', { exact: true });
  const confirmation = dialog.getByRole('button', { name: /^确\s*认$/ });
  const receivedOn = await date.inputValue();
  await quantity.fill('750');
  await evidence.fill('合成验收·第二车签收');

  await buyer.route(url.href, (route) => route.fulfill({ status: 503, json: { error: { code: 'INTERNAL' } } }), { times: 1 });
  const isReceiptResponse = (response: Response) =>
    response.url() === url.href && response.request().method() === 'POST';

  const [failure] = await Promise.all([buyer.waitForResponse(isReceiptResponse), confirmation.click()]);
  assert.equal(failure.status(), 503);
  await dialog.getByRole('alert').filter({ hasText: '可以重新确认' }).waitFor();
  assert.equal(await quantity.inputValue(), '750');
  assert.equal(await date.inputValue(), receivedOn);
  assert.equal(await evidence.inputValue(), '合成验收·第二车签收');
  await confirmation.and(dialog.locator('button:enabled')).waitFor();

  const [success] = await Promise.all([buyer.waitForResponse(isReceiptResponse), confirmation.click()]);
  assert.equal(success.status(), 200);
  assert.deepEqual(success.request().postDataJSON(), failure.request().postDataJSON());
  await dialog.waitFor({ state: 'hidden' });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function fulfillment({ page, origin }: { readonly page: Page; readonly origin: URL }) {
  const response = await page.request.get(new URL('/api/v1/lines/' + lineId, origin).href);
  assert.equal(response.status(), 200);
  const detail: unknown = await response.json();
  assert.ok(isObject(detail) && Array.isArray(detail.batches));
  const batches: readonly unknown[] = detail.batches;
  const batch = batches.find((entry) => isObject(entry) && entry.id === batchId);
  assert.ok(isObject(batch) && isObject(batch.fulfillment));
  return batch.fulfillment;
}
