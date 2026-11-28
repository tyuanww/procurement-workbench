import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';

export async function checkFollowUpOrderQuery({ page, origin, out, po, warehouse }: {
  readonly page: Page;
  readonly origin: URL;
  readonly out: string;
  readonly po: string;
  readonly warehouse: string;
}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL('/today', origin).href);
  await page.locator('aside').getByRole('link', { name: '跟进中心', exact: true }).click();
  const search = page.getByPlaceholder('搜索单号 / 品名 / 编码');
  await search.fill(po);
  await search.press('Enter');
  const order = page.getByRole('link', { name: po, exact: true });
  await order.waitFor();
  const orderPath = await order.getAttribute('href');
  assert.ok(orderPath?.startsWith('/lines/'));
  const orderRoute = decodeURIComponent(orderPath);
  assert.equal(new URL(page.url()).searchParams.has('lane'), false);

  const batchPath = new URL('/api/v1' + orderPath + '/batches', origin);
  const second = await createBatch(page, batchPath, warehouse);
  assert.equal(second.seq, 2);
  const searchAddress = page.url();

  for (const { width, height } of [{ width: 1440, height: 900 }, { width: 320, height: 667 }]) {
    await page.setViewportSize({ width, height });
    if (width === 320) await page.goto(searchAddress);
    await order.waitFor();
    const preview = page.getByRole('row').filter({ has: order }).getByRole('button', { name: '预览', exact: true });
    await preview.press('Enter');
    const dialog = page.getByRole('dialog', { name: po + ' 预览', exact: true });
    const batch = dialog.getByRole('link', { name: '查看第 2 批', exact: true });
    await batch.waitFor();
    assert.match(await batch.ariaSnapshot(), /link "查看第 2 批"/u);
    await batch.focus();
    await page.screenshot({ path: join(out, 'follow-up-batch-2-' + width + '.png'), animations: 'disabled' });
    await batch.press('Enter');
    await page.waitForURL((url) => decodeURIComponent(url.pathname) === orderRoute && url.searchParams.get('focusBatch') === second.id);
    const batchDetails = page.getByRole('region', { name: '批次', exact: true });
    await batchDetails.getByText(/^2 · .*确认 2099-11-27$/u).waitFor();
    await page.waitForFunction(() => document.activeElement?.matches('li[tabindex="-1"]') === true
      && document.activeElement.textContent?.includes('2 · 已确认 · 确认 2099-11-27') === true);
    await batchDetails.getByRole('button', { name: '回查第 2 批原表', exact: true }).press('Enter');
    const source = batchDetails.getByRole('region', { name: '采购表 · 本单参考', exact: true });
    await source.getByRole('link', { name: /po-master-procurement\.xlsx.*达肤妍项目进度表.*第 5 行/u }).waitFor();
    await source.getByText('采购数量', { exact: true }).first().waitFor();
    await source.getByText('200000', { exact: true }).first().waitFor();
    await batchDetails.getByRole('region', { name: '工厂表 · 本批已归属', exact: true })
      .getByText('本批暂无已归属的工厂出货原行。', { exact: true }).waitFor();
    await page.getByRole('link', { name: '返回跟进中心', exact: true }).press('Enter');
    await page.waitForURL((url) => url.pathname === '/lines' && url.searchParams.get('q') === po);
    await page.waitForFunction((text) => document.activeElement?.textContent === text, po);
    assert.equal(await search.inputValue(), po);
  }

  await page.reload();
  await order.waitFor();
  assert.equal(await search.inputValue(), po);
  const lanes = page.getByRole('radiogroup', { name: '订单线别' });
  await lanes.getByRole('radio', { name: '成品线', exact: true }).press('Space');
  await page.waitForURL((url) => url.searchParams.get('lane') === 'finished' && url.searchParams.get('q') === po);
  await page.getByText(/没有符合条件的订单行/u).waitFor();
  assert.equal(await order.count(), 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  return { po, batch: second.seq, widths: [1440, 320], sourceEvidence: true, returnFocus: true, explicitFinishedLane: true };
}

async function createBatch(page: Page, path: URL, receiverPartyId: string) {
  const response = await page.request.post(path.href, { data: { receiverPartyId, dateBuyerConfirmed: '2099-11-27', plannedQty: 100 } });
  assert.equal(response.ok(), true, await response.text());
  const batch: unknown = await response.json();
  assert.ok(typeof batch === 'object' && batch !== null && 'id' in batch && typeof batch.id === 'string'
    && 'seq' in batch && typeof batch.seq === 'number');
  return { id: batch.id, seq: batch.seq };
}
