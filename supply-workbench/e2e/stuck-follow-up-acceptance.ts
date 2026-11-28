import assert from 'node:assert/strict';
import type { Locator, Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';

export async function checkStuckRoundTrip(page: Page, drawer: Locator, batchId: string, withBrowserBack: boolean) {
  const order = drawer.getByRole('link', { name: '核对本批记录', exact: true });
  await order.waitFor();
  const before = page.url();
  const target = new URL(await order.getAttribute('href') ?? '', before);
  assert.match(target.pathname, /^\/lines\/[^/]+$/u);
  assert.equal(target.searchParams.get('focusBatch'), batchId);
  await order.press('Enter');
  await page.waitForURL(target.href);
  await page.getByRole('region', { name: '批次', exact: true }).locator('li:focus').waitFor();
  if (withBrowserBack) await page.goBack();
  else await page.getByRole('link', { name: '返回管理看板', exact: true }).press('Enter');
  await page.waitForURL(before);
  await order.and(page.locator(':focus')).waitFor();
}
