import assert from 'node:assert/strict';
import type { Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { sidebarLink } from './sidebar.ts';

const personal = '/today/personal';
const lineId = 'hz09-line-1';
const batchId = 'hz09-batch-1';
const note = '个人工作台合成验收：明早核对发货安排';
const followUpTime = '2099-01-12T10:00';

export async function checkPersonalWorkspace(input: { readonly buyer: Page; readonly peer: Page; readonly origin: URL }) {
  const { buyer, peer, origin } = input;
  const buyerMain = buyer.getByRole('main');
  const peerMain = peer.getByRole('main');
  await (await sidebarLink(buyer.locator('aside'), '今日事项', '个人工作台')).click();
  await buyer.waitForURL((url) => url.pathname === personal);
  await buyerMain.getByRole('heading', { name: '个人工作台', exact: true }).waitFor({ state: 'attached' });
  const opening = buyerMain.getByRole('button', { name: /HZ09-0001|合成待催 1(?:\s|$)/ }).first();
  await opening.waitFor();
  await peer.goto(new URL(personal, origin).href);
  await peerMain.getByText(/HZ09-0502/).first().waitFor();
  assert.equal(await peerMain.getByText(/HZ09-0001/).count(), 0);
  assert.equal(await buyerMain.getByText(/HZ09-0502/).count(), 0);

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
  await buyer.waitForURL((url) => url.pathname === personal);
  const scheduled = buyerMain.getByRole('button', { name: /^已约跟进/, pressed: true });
  await scheduled.waitFor();
  await buyerMain.getByText(/2099-01-12 10:00/).first().waitFor();
  await buyer.reload();
  await scheduled.waitFor();
  await buyerMain.getByText(/2099-01-12 10:00/).first().waitFor();
  assert.deepEqual(await fulfillment({ page: buyer, origin }), before);

  return { ownerIsolation: true, batchId, nextFollowUpAt: record.nextFollowUpAt, fulfillmentUnchanged: true };
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
