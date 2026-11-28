import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';

export async function checkProductPurchaseEntry(page: Page, origin: URL, out: string) {
  const source = new URL('/products/ui-demo-cleanser-channel?card=purchases&scope=exact&stage=awaiting_shipment', origin);
  const target = new URL('/lines/ui-demo-line-buyer', origin);
  const widths = [1440, 320];
  const trigger = page.getByRole('button', { name: 'UI-DEMO-005', exact: true });
  const drawer = page.getByRole('dialog', { name: '采购记录', exact: true });
  const order = drawer.getByRole('link', { name: '核对订单记录', exact: true });
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 320 ? 780 : 900 });
    await page.goto(source.href);
    await trigger.waitFor();
    assert.equal(await page.getByRole('button', { name: 'UI-DEMO-001', exact: true }).count(), 0);
    await trigger.press('Enter');
    await drawer.getByText('2099000000101-1', { exact: true }).waitFor();
    await drawer.getByText('UI-DEMO-005', { exact: true }).waitFor();
    const opened = new URL(page.url());
    const openAddress = opened.href;
    assert.equal(opened.searchParams.get('purchaseRecord'), 'ui-demo-line-buyer');
    opened.searchParams.delete('purchaseRecord');
    assert.equal(opened.href, source.href);
    assert.match(await order.ariaSnapshot(), /link "核对订单记录"/u);
    await page.screenshot({ path: join(out, `product-purchase-record-${width}.png`), animations: 'disabled' });
    for (const browserBack of [false, true]) {
      await order.press('Enter');
      await page.waitForURL(target.href);
      await page.getByRole('heading', { name: 'UI-DEMO-005', exact: true }).waitFor();
      if (browserBack) await page.goBack();
      else await page.getByRole('link', { name: '返回产品采购', exact: true }).press('Enter');
      await page.waitForURL(openAddress);
      await order.and(page.locator(':focus')).waitFor();
    }
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    await trigger.and(page.locator(':focus')).waitFor();
    assert.equal(page.url(), source.href);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  return { widths, product: 'ui-demo-cleanser-channel', order: 'UI-DEMO-005', orderDrawerRestored: true };
}
