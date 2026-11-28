import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Locator, Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';

const product = 'ui-demo-cleanser-channel';
const exactLine = { id: 'ui-demo-line-buyer', po: 'UI-DEMO-005', barcode: '2099000000101-1', relationship: '本条码' };
const siblingLine = { id: 'ui-demo-line-chase', po: 'UI-DEMO-001', barcode: '2099000000101', relationship: '同基础码' };
const rawName = '演示净润洁面乳';
const rawSupplier = `UI-DEMO-SUPPLIER-${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3)}`;
const widths = [{ width: 1440, height: 900 }, { width: 320, height: 667 }] as const;

export async function checkProductPurchaseEntry({ page, manager, origin, out }: {
  readonly page: Page; readonly manager: Page; readonly origin: URL; readonly out: string;
}) {
  const source = new URL(`/products/${product}?card=purchases&scope=exact&stage=awaiting_shipment`, origin);
  const exactTarget = new URL(`/lines/${exactLine.id}`, origin).href;
  const exactTrigger = trigger(page, exactLine);
  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    await page.goto(source.href);
    await exactTrigger.waitFor();
    assert.equal(await trigger(page, siblingLine).count(), 0);
    if (viewport.width === 320) assert.ok((await bounds(exactTrigger)).height >= 44);
    await exactTrigger.press('Enter');
    const drawer = await verifyPurchase(page, exactLine);
    const opened = new URL(page.url());
    const openAddress = opened.href;
    assert.equal(opened.searchParams.get('purchaseRecord'), exactLine.id);
    opened.searchParams.delete('purchaseRecord');
    assert.equal(opened.href, source.href);
    await page.reload();
    await verifyPurchase(page, exactLine);
    const order = orderLink(drawer);
    assert.match(await order.ariaSnapshot(), /link "核对订单记录"/u);
    await page.screenshot({ path: join(out, `product-purchase-record-${viewport.width}.png`), animations: 'disabled' });
    await verifyOpenDrawerFit(drawer, viewport.width);
    if (viewport.width === 320) assert.ok((await bounds(order)).height >= 44);
    for (const browserBack of [false, true]) {
      await openOrder(page, exactTarget, exactLine.po);
      if (browserBack) await page.goBack();
      else await page.getByRole('link', { name: '返回产品采购', exact: true }).press('Enter');
      await page.waitForURL(openAddress);
      await order.and(page.locator(':focus')).waitFor();
    }
    await closePurchase(page, exactTrigger, source.href, viewport.width === 320);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  }
  await verifyUnavailablePurchase(page, source);
  await verifyDrawerPrecedence(page, manager, source);
  await manager.setViewportSize(widths[1]);
  await manager.goto(source.href);
  await trigger(manager, exactLine).press('Enter');
  await verifyPurchase(manager, exactLine);
  assert.equal(await manager.getByRole('button', { name: '更新此产品', exact: true }).count(), 0);
  await openOrder(manager, exactTarget, exactLine.po);
  assert.equal(await manager.getByRole('button', { name: '新增批次', exact: true }).count(), 0);
  await manager.getByRole('link', { name: '返回产品采购', exact: true }).press('Enter');
  await orderLink(purchaseDrawer(manager)).and(manager.locator(':focus')).waitFor();
  await closePurchase(manager, trigger(manager, exactLine), source.href);
  await page.setViewportSize(widths[0]);
  await manager.setViewportSize(widths[0]);
  return { widths, product, order: exactLine.po, orderDrawerRestored: true, reopenOnReload: true,
    unavailableSelectionCleared: true, drawerPrecedence: true, matchingByBarcode: true, managerReadOnly: true };
}

async function verifyUnavailablePurchase(page: Page, source: URL) {
  const wrongScope = new URL(source);
  wrongScope.searchParams.set('purchaseRecord', siblingLine.id);
  await page.goto(wrongScope.href);
  await verifyFallback(page, source);
  const scope = page.getByRole('radiogroup', { name: '采购条码范围' }).getByRole('radio', { name: '全部渠道', exact: true });
  await scope.press('Space');
  await trigger(page, siblingLine).waitFor();
  assert.equal(await purchaseDrawer(page).count(), 0);
  const allChannels = page.url();
  for (const line of [exactLine, siblingLine]) {
    await trigger(page, line).press('Enter');
    await verifyPurchase(page, line);
    await openOrder(page, new URL(`/lines/${line.id}`, source).href, line.po);
    await page.getByRole('link', { name: '返回产品采购', exact: true }).press('Enter');
    await orderLink(purchaseDrawer(page)).and(page.locator(':focus')).waitFor();
    await closePurchase(page, trigger(page, line), allChannels);
  }
  const otherStage = new URL(source);
  otherStage.searchParams.set('stage', 'no_batch');
  const wrongStage = new URL(otherStage);
  wrongStage.searchParams.set('purchaseRecord', exactLine.id);
  await page.goto(wrongStage.href);
  await verifyFallback(page, otherStage);
}

async function verifyFallback(page: Page, expected: URL) {
  await page.waitForURL(expected.href);
  await page.getByRole('status').filter({ hasText: '原采购记录不在当前结果中，已保留采购筛选。' }).waitFor();
  await page.getByRole('combobox', { name: '采购阶段', exact: true }).and(page.locator(':focus')).waitFor();
  assert.equal(await purchaseDrawer(page).count(), 0);
}

async function verifyDrawerPrecedence(admin: Page, manager: Page, source: URL) {
  const conflict = new URL(source);
  conflict.searchParams.set('drawer', 'edit');
  conflict.searchParams.set('purchaseRecord', exactLine.id);
  await admin.goto(conflict.href);
  const editor = admin.getByRole('dialog', { name: /^更新此产品/u });
  await editor.waitFor();
  await admin.waitForURL(url => url.searchParams.get('drawer') === 'edit' && !url.searchParams.has('purchaseRecord'));
  assert.equal(await admin.getByRole('dialog').count(), 1);
  await editor.getByRole('button', { name: '关闭 Excel 导入', exact: true }).press('Enter');
  await editor.waitFor({ state: 'hidden' });
  await admin.waitForURL(source.href);
  assert.equal(await purchaseDrawer(admin).count(), 0);

  await manager.goto(conflict.href);
  await verifyPurchase(manager, exactLine);
  await manager.waitForURL(url => !url.searchParams.has('drawer') && url.searchParams.get('purchaseRecord') === exactLine.id);
  assert.equal(await manager.getByRole('dialog').count(), 1);
}

function trigger(page: Page, { po }: typeof exactLine) {
  return page.getByRole('button', { name: po, exact: true });
}

function purchaseDrawer(page: Page) {
  return page.getByRole('dialog', { name: '采购记录', exact: true });
}

function orderLink(drawer: Locator) {
  return drawer.getByRole('link', { name: '核对订单记录', exact: true });
}

async function verifyPurchase(page: Page, line: typeof exactLine) {
  const drawer = purchaseDrawer(page);
  for (const value of [line.po, line.barcode, line.relationship, rawName]) await drawer.getByText(value, { exact: true }).waitFor();
  const exact = line.id === exactLine.id;
  for (const [label, value] of [
    ['物料编码', exact ? 'UI-DEMO-ITEM-005' : '未填写'],
    ['采购数量', exact ? '300' : '1,000'],
    ['供应商原文', exact ? rawSupplier : '未填写'],
    ['当前采购阶段', '待发货'],
  ] as const) {
    const field = drawer.getByRole('row').filter({ has: page.getByText(label, { exact: true }) });
    await field.getByText(value, { exact: true }).waitFor();
  }
  return drawer;
}

async function openOrder(page: Page, target: string, po: string) {
  await orderLink(purchaseDrawer(page)).press('Enter');
  await page.waitForURL(target);
  await page.getByRole('heading', { name: po, exact: true }).waitFor();
}

async function closePurchase(page: Page, source: Locator, address: string, viaPointer = false) {
  if (viaPointer) {
    const close = purchaseDrawer(page).getByRole('button', { name: /^(关闭|Close)$/u });
    const target = await bounds(close);
    assert.ok(target.width >= 44 && target.height >= 44);
    await close.click();
  } else await page.keyboard.press('Escape');
  await purchaseDrawer(page).waitFor({ state: 'hidden' });
  await source.and(page.locator(':focus')).waitFor();
  assert.equal(page.url(), address);
}

async function verifyOpenDrawerFit(drawer: Locator, width: number) {
  const { x, width: panelWidth } = await bounds(drawer);
  assert.ok(x >= -1 && x + panelWidth <= width + 1);
  const body = drawer.locator('.ant-drawer-body');
  assert.equal(await body.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
}

async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  assert.ok(box);
  return box;
}
