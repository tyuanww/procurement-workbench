import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { sidebarLink } from './sidebar.ts';

const cleanser = '/products/ui-demo-cleanser';
const cream = '/products/ui-demo-cream';

export async function checkFrontendCloseout({ page, origin, out }: {
  readonly page: Page; readonly origin: URL; readonly out: string;
}) {
  await page.setViewportSize({ width: 1288, height: 911 });
  await page.goto(new URL('/lines', origin).href);
  await page.getByRole('row').filter({ has: page.getByRole('cell') }).first().waitFor();
  const collapsedIcons = await checkCollapsedIcons(page, out);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL('/today', origin).href);
  await checkActionBoard(page);
  await page.screenshot({ path: join(out, 'closeout-action-board.png'), animations: 'disabled' });
  await checkDailySchedule(page);
  await page.screenshot({ path: join(out, 'closeout-daily-schedule.png'), animations: 'disabled' });

  await page.goto(new URL('/products', origin).href);
  await checkProductArchive(page, out);
  return { collapsedIcons, actionBoard: ['催货', '缺确认日期', '待建批次', '到仓待收'], dailySchedule: ['今日', '逾期', '前置阻塞'],
    archive: { products: 3, exactPurchases: 2, allChannelPurchases: 4, stock: 320, bomParts: 2, noBom: true } };
}

async function checkCollapsedIcons(page: Page, out: string): Promise<number> {
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  const sidebar = page.locator('.ant-layout-sider-collapsed');
  await sidebar.waitFor();
  const toggle = sidebar.getByRole('button', { name: '展开侧栏', exact: true });
  await toggle.waitFor();
  await page.waitForFunction(() => {
    const sider = document.querySelector('.ant-layout-sider-collapsed');
    if (sider === null) return false;
    const { x, width } = sider.getBoundingClientRect();
    const icons = sider.querySelectorAll('ul.ant-menu-root > li > .ant-menu-item-icon svg, ul.ant-menu-root > li > .ant-menu-submenu-title > .ant-menu-item-icon svg, button[aria-label="展开侧栏"] svg');
    return icons.length === 7 && [...icons].every((icon) => {
      const bounds = icon.getBoundingClientRect();
      return bounds.width > 0 && Math.abs(bounds.x + bounds.width / 2 - x - width / 2) <= 1;
    });
  });
  await page.screenshot({ path: join(out, 'closeout-collapsed-sidebar.png'), animations: 'disabled' });
  await toggle.click();
  await sidebar.waitFor({ state: 'hidden' });
  return 6;
}

async function checkActionBoard(page: Page): Promise<void> {
  const board = page.getByRole('region', { name: '行动板待办' });
  await board.getByText('UI-DEMO-001', { exact: false }).first().waitFor();
  await board.getByText('UI-DEMO-002', { exact: false }).first().waitFor();
  await page.locator('#today-pending-batches').getByText('UI-DEMO-003', { exact: false }).first().waitFor();
  await page.locator('#today-arrival-memos').getByText('UI-DEMO-004', { exact: false }).first().waitFor();
  assert.equal(await board.getByText('UI-DEMO-005', { exact: false }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /复制全部催单/ }).isEnabled(), true);
}

async function checkDailySchedule(page: Page): Promise<void> {
  await (await sidebarLink(page.locator('aside'), '今日事项', '今日排期')).click();
  const task = page.getByRole('button', { name: /确认今日出货/ });
  await task.waitFor();
  await page.getByRole('button', { name: /核实逾期包材/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /明日复核|已完成确认/ }).count(), 0);
  await task.press('Enter');
  const detail = page.getByRole('dialog', { name: /确认今日出货/ });
  await detail.getByText(/核实逾期包材.*仍阻塞/).waitFor();
  await page.keyboard.press('Escape');
  await detail.waitFor({ state: 'hidden' });
}

async function checkProductArchive(page: Page, out: string): Promise<void> {
  const product = page.locator(`a[href="${cleanser}"]`);
  await product.waitFor();
  await page.getByText('表格', { exact: true }).click();
  const table = page.getByRole('table');
  for (const barcode of ['2099000000101', '2099000000101-1', '2099000000200']) {
    await table.getByText(barcode, { exact: true }).waitFor();
  }
  await page.screenshot({ path: join(out, 'closeout-product-archive.png'), animations: 'disabled' });
  await product.click();
  await page.getByRole('heading', { name: '产品 演示净润洁面乳', exact: true }).waitFor();
  await page.getByRole('button', { name: /^采\s*购$/ }).click();
  await page.getByText('采购 4 行', { exact: true }).waitFor();
  await page.getByRole('button', { name: '只看本条码', exact: true }).click();
  await page.getByText('采购 2 行', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^库\s*存$/ }).click();
  await page.getByText('库存 1 行', { exact: true }).waitFor();
  const stock = await page.request.get(new URL('/api/v1/products/ui-demo-cleanser/stock', page.url()).href);
  assert.equal((await stock.json()).factory.total.value, 320);
  const source = await page.request.get(new URL('/api/v1/imports/ui-demo-stock-batch', page.url()).href);
  assert.equal(source.status(), 200);
  await page.getByRole('button', { name: '组成物料', exact: true }).click();
  await page.getByText('子件 2', { exact: true }).waitFor();
  await page.goto(new URL(cream, page.url()).href);
  await page.getByRole('button', { name: '组成物料', exact: true }).click();
  await page.getByText('没有 BOM', { exact: true }).waitFor();
}
