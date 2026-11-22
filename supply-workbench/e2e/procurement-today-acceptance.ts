import assert from 'node:assert/strict';
import type { Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';

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
