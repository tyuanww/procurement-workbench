import assert from 'node:assert/strict';
import type { Locator, Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';

const lineId = 'hz09-line-1';
const confirmDate = '2024-11-16';
const readPaths = [`/api/v1/lines/${lineId}`, `/api/v1/lines/${lineId}/timeline`];
const secondBatchTitle = /^2 · .+ · 确认 2024-11-16$/u;

export async function addStuckSecondBatch(buyer: Page, origin: URL, warehouse: string): Promise<string> {
  const response = await buyer.request.post(new URL(`/api/v1/lines/${lineId}/batches`, origin).href, {
    data: { plannedQty: 1, receiverPartyId: warehouse, dateBuyerConfirmed: confirmDate },
  });
  assert.ok(response.ok(), `创建第 2 批 HTTP ${response.status()}`);
  const { id, seq } = await response.json();
  assert.equal(seq, 2);
  assert.ok(typeof id === 'string' && id !== '');
  return id;
}

export async function checkStuckRoundTrip(page: Page, drawer: Locator, batchId: string, withBrowserBack: boolean) {
  const order = drawer.getByRole('link', { name: '核对本批记录', exact: true });
  await order.waitFor();
  const before = page.url();
  const target = new URL(await order.getAttribute('href') ?? '', before);
  assert.equal(target.pathname, `/lines/${lineId}`);
  assert.equal(target.searchParams.get('focusBatch'), batchId);
  await Promise.all([
    ...readPaths.map((path) => page.waitForRequest((request) => request.method() === 'GET' && new URL(request.url()).pathname === path)),
    page.waitForURL(target.href),
    order.press('Enter'),
  ]);
  await page.getByRole('region', { name: '批次', exact: true }).locator('li:focus').getByText(secondBatchTitle).waitFor();
  for (const name of ['新增批次', '保存确认日', '登记发货', '登记收货']) {
    assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0);
  }
  if (withBrowserBack) await page.goBack();
  else await page.getByRole('link', { name: '返回管理看板', exact: true }).press('Enter');
  await page.waitForURL(before);
  await order.and(page.locator(':focus')).waitFor();
  return target;
}

export async function openStuckSecondBatch(page: Page, trigger: Locator, drawer: Locator) {
  let reads = 0;
  const track = (request: import('../node_modules/.pnpm/node_modules/playwright/index.js').Request) => {
    if (request.method() === 'GET' && readPaths.includes(new URL(request.url()).pathname)) reads += 1;
  };
  page.on('request', track);
  try {
    await trigger.press('Enter');
    await drawer.getByText('第 2 批', { exact: true }).waitFor();
    assert.equal(reads, 0, '在看板查看批次抽屉时不读订单明细或时间线');
  } finally {
    page.off('request', track);
  }
}
