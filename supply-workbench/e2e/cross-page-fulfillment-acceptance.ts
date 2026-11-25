import assert from 'node:assert/strict';
import type { Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';

const po = 'UX-SPLIT-1048';

export async function checkCrossPageFulfillment({ page, origin, buyer, warehouse }: {
  readonly page: Page;
  readonly origin: URL;
  readonly buyer: string;
  readonly warehouse: string;
}) {
  const create = async (path: string, data: Record<string, unknown>) => {
    const response = await page.request.post(new URL(path, origin).href, { data });
    assert.ok(response.ok(), `创建跨页验收样本 ${path} HTTP ${response.status()}`);
    return response.json();
  };
  const { line } = await create('/api/v1/lines', {
    poRaw: po, lane: 'material', nameRaw: '合成旅行分装瓶', qtyOrdered: 1000, unit: '件',
    receiverPartyId: warehouse, buyerUserId: buyer, supplierPartyId: 'ui-demo-factory',
  });
  const facts = [{ planned: 400, sent: 400, received: 400 }, { planned: 600, sent: 350, received: 200 }];
  for (const lot of facts) {
    const { id } = await create('/api/v1/lines/' + line.id + '/batches', {
      plannedQty: lot.planned, receiverPartyId: warehouse, dateBuyerConfirmed: '2025-01-01',
    });
    await create('/api/v1/batches/' + id + '/shipments', {
      qty: lot.sent, shippedOn: '2025-01-02', fulfillment: { kind: 'verified', unit: '件', evidence: po },
    });
    await create('/api/v1/batches/' + id + '/receipts', {
      qty: lot.received, receivedOn: '2025-01-03', category: 'packaging',
      fulfillment: { kind: 'received', unit: '件', disposition: 'normal', evidence: po },
    });
  }

  await page.goto(new URL('/lines?q=' + po + '&lane=material&overdueOnly=true', origin).href);
  const orders = page.getByRole('row').filter({ hasText: po });
  await orders.first().waitFor();
  assert.equal(await orders.count(), 1, '同一订单行在逾期查询只出现一次');
  await page.goto(new URL('/dashboard?lane=material&card=overdue', origin).href);
  const detail = page.getByRole('button', { name: '查看卡点明细 ' + po + ' 第 2 批', exact: true });
  await detail.waitFor();
  assert.equal(await page.getByRole('button', { name: '查看卡点明细 ' + po + ' 第 1 批', exact: true }).count(), 0);
  await detail.press('Enter');
  const drawer = page.getByRole('dialog', { name: '卡点批次明细' });
  const shown = await drawer.innerText();
  for (const [label, count] of [['未发', 250], ['在途', 150], ['实收', 200]] as const) {
    assert.match(shown, new RegExp(label + '[^0-9]*' + count + '\\s*件'));
  }
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  assert.ok(await detail.evaluate((element) => element === document.activeElement));
  return { po, overdueLines: 1, overdueBatch: 2, unshipped: 250, inTransit: 150, received: 200 };
}
