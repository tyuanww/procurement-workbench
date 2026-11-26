import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Locator, Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { sidebarEntries, sidebarLink } from './sidebar.ts';

const cleanser = '/products/ui-demo-cleanser';
const cream = '/products/ui-demo-cream';
const todayWidths = [320, 390, 768, 1280, 1440, 1920] as const;

export async function checkFrontendCloseout({ page, origin, out }: {
  readonly page: Page; readonly origin: URL; readonly out: string;
}) {
  await page.setViewportSize({ width: 1288, height: 911 });
  await page.goto(new URL('/lines', origin).href);
  await page.getByRole('row').filter({ has: page.getByRole('cell') }).first().waitFor();
  const collapsedIcons = await checkCollapsedIcons(page, out);
  await checkSaveFollowUpView(page);

  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto(new URL('/today', origin).href);
  await checkActionBoard(page);
  await checkBatchPriorityFilter(page);
  await checkTodayLayouts(page, out, 'action-board');
  await page.screenshot({ path: join(out, 'closeout-action-board.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await checkArrivals(page);
  await checkDailySchedule(page);
  await checkTodayLayouts(page, out, 'daily-schedule');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: join(out, 'closeout-daily-schedule.png'), animations: 'disabled' });

  await page.goto(new URL('/products', origin).href);
  await checkProductArchive(page, out);
  await checkProductSearch(page, origin);
  await checkProductPackagingReturn(page, origin);
  return { collapsedIcons, actionBoard: ['催货', '缺确认日期', '待建批次'], arrivals: ['待收批次'], dailySchedule: ['今日', '逾期', '前置阻塞'],
    archive: { products: 3, exactPurchases: 2, allChannelPurchases: 4, stock: 320, bomParts: 2, noBom: true, searchRestored: true, packagingReturn: ['card', 'table'] },
    savedFollowUpView: true };
}

async function checkSaveFollowUpView(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: '保存当前视图', exact: true });
  const dialog = page.getByRole('dialog', { name: '保存当前视图', exact: true });
  const viewName = '合成验收跟进视图';
  await trigger.press('Enter');
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await trigger.click();
  await dialog.getByRole('textbox', { name: '视图名称', exact: true }).fill(viewName);
  await dialog.getByRole('button', { name: /^保\s*存$/ }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForURL((url) => url.searchParams.get('view') === viewName);
  await page.reload();
  await page.getByText(viewName, { exact: true }).first().waitFor();
}

async function checkCollapsedIcons(page: Page, out: string): Promise<number> {
  const entryCount = await sidebarEntries(page.locator('aside')).count();
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  const sidebar = page.locator('.ant-layout-sider-collapsed');
  await sidebar.waitFor();
  const toggle = sidebar.getByRole('button', { name: '展开侧栏', exact: true });
  await toggle.waitFor();
  await page.waitForFunction((expectedIconCount) => {
    const sider = document.querySelector('.ant-layout-sider-collapsed');
    if (sider === null) return false;
    const { x, width } = sider.getBoundingClientRect();
    const icons = sider.querySelectorAll('ul.ant-menu-root > li > .ant-menu-item-icon svg, ul.ant-menu-root > li > .ant-menu-submenu-title > .ant-menu-item-icon svg, button[aria-label="展开侧栏"] svg');
    return icons.length === expectedIconCount && [...icons].every((icon) => {
      const bounds = icon.getBoundingClientRect();
      return bounds.width > 0 && Math.abs(bounds.x + bounds.width / 2 - x - width / 2) <= 1;
    });
  }, entryCount + 1);
  await page.screenshot({ path: join(out, 'closeout-collapsed-sidebar.png'), animations: 'disabled' });
  await toggle.click();
  await sidebar.waitFor({ state: 'hidden' });
  return entryCount;
}

async function checkActionBoard(page: Page): Promise<void> {
  const board = page.getByRole('region', { name: '工作台待办' });
  await board.getByRole('article', { name: /^UI-DEMO-001/ }).waitFor();
  await board.getByRole('article', { name: /^UI-DEMO-002/ }).waitFor();
  await page.getByRole('heading', { name: '个人工作台', level: 1, exact: true }).waitFor();
  await page.getByRole('heading', { name: '我的行动清单', level: 2, exact: true }).waitFor();
  await checkActionListMotion(page);
  const switchScope = page.getByRole('button', { name: /切换工作范围$/u });
  await checkQuickMenuDismissal(page, /我的行动清单.*切换工作范围$/u);
  await switchScope.press('Enter');
  await page.getByRole('menuitem').and(page.locator(':focus')).waitFor();
  await page.getByRole('menuitem', { name: /^已约跟进/u }).waitFor();
  await page.getByRole('menuitem', { name: /^待分派/u }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: /^已约跟进/u }).waitFor({ state: 'hidden' });
  await switchScope.and(page.locator(':focus')).waitFor();
  const breadcrumb = page.getByRole('banner').getByRole('navigation', { name: '当前位置' });
  assert.deepEqual(await breadcrumb.locator('.ant-breadcrumb-link').allTextContents(), ['今日事项', '个人工作台']);
  assert.equal(await page.getByText(/^业务日\s+\d{4}-\d{2}-\d{2}$/u).count(), 0);
  await page.getByRole('main').getByText(/^\*数据截止 \d{4}-\d{2}-\d{2}$/u).waitFor();
  const pending = board.getByText('UI-DEMO-003', { exact: false }).first();
  await pending.waitFor();
  const task = board.getByRole('button', { name: /确认今日出货/ });
  await task.waitFor();
  await task.click();
  const taskDetail = page.getByRole('dialog', { name: /确认今日出货/ });
  await taskDetail.getByText(/核实逾期包材.*仍阻塞/).waitFor();
  await page.keyboard.press('Escape');
  await taskDetail.waitFor({ state: 'hidden' });
  const views = board.getByRole('radiogroup', { name: '工作台视图', exact: true });
  await views.getByRole('radio', { name: '日历', exact: true }).press('Space');
  const calendar = board.getByRole('region', { name: '工作台日历' });
  const selectedDay = calendar.getByRole('button', { pressed: true, name: /待办 \d+项/u });
  assert.match(await selectedDay.getAttribute('aria-label') ?? '', /\d{4}年\d+月\d+日，待办 \d+项/u);
  const workDay = await selectedDay.getAttribute('data-calendar-date');
  assert.ok(workDay);
  const beforeYear = page.url();
  await calendar.getByRole('radiogroup', { name: '日历显示周期' }).getByRole('radio', { name: '年', exact: true }).press('Space');
  const month = calendar.locator(`[data-calendar-month="${workDay.slice(0, 7)}"]`);
  assert.match(await month.getAttribute('aria-label') ?? '', /待办 \d+项/u);
  await month.press('Enter');
  await selectedDay.and(page.locator(':focus')).waitFor();
  assert.equal(await selectedDay.getAttribute('data-calendar-date'), workDay);
  assert.equal(page.url(), beforeYear);
  await checkCalendarBesideResults(page);
  await pending.waitFor();
  await task.waitFor();
  await views.getByRole('radio', { name: '列表', exact: true }).press('Space');
  assert.equal(await board.getByRole('article', { name: /^UI-DEMO-005/ }).count(), 0);
  const chase = board.getByRole('button', { name: '按工厂复制', exact: true });
  await chase.click();
  const factoryDialog = page.getByRole('dialog', { name: '按工厂复制', exact: true });
  assert.equal(await factoryDialog.getByRole('button', { name: /^预览内部汇总/ }).isEnabled(), true);
  await page.keyboard.press('Escape');
  await factoryDialog.waitFor({ state: 'hidden' });
  await chase.and(page.locator(':focus')).waitFor();
}

async function checkActionListMotion(page: Page) {
  const selectedRow = page.locator('.today-batch-card').filter({ hasText: 'UI-DEMO-002' });
  await selectedRow.locator('.today-row-layout').click({ position: { x: 8, y: 8 } });
  const beam = selectedRow.locator('.today-row-beam');
  await beam.waitFor();
  const animation = await beam.evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return [style.animationDuration, style.animationIterationCount];
  });
  assert.deepEqual(animation, ['4.8s', 'infinite']);
  const bottomInset = await beam.evaluate((element) => {
    const row = element.closest('.today-batch-card');
    return (row?.getBoundingClientRect().bottom ?? 0) - element.getBoundingClientRect().bottom;
  });
  assert.ok(bottomInset >= 1, '流光底边应与相邻分隔线留出间隔');
  assert.equal(await page.locator('.today-list-panel .ant-border-beam').count(), 1);
  assert.equal(await page.getByRole('button', { name: /清单流光/ }).count(), 0);

  const divider = page.getByRole('separator', { name: '调整行动清单与事项助手宽度' });
  const list = page.locator('.today-list-panel');
  const width = () => list.evaluate((element) => element.getBoundingClientRect().width);
  const initial = await width();
  await divider.press('ArrowLeft');
  await beam.waitFor({ state: 'hidden' });
  await page.waitForFunction((initialWidth) => {
    const panel = document.querySelector('.today-list-panel');
    return panel !== null && panel.getBoundingClientRect().width < initialWidth - 20;
  }, initial);
  await checkActionPanelDrag(page, divider);

  await selectedRow.locator('.today-row-layout').click({ position: { x: 8, y: 8 } });
  await beam.waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    await beam.waitFor({ state: 'hidden' });
    assert.equal(await selectedRow.getAttribute('data-current'), 'true');
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
}

async function checkActionPanelDrag(page: Page, divider: Locator) {
  // The keyboard transition can still be moving the handle when the first width change is visible.
  await divider.hover();
  const handle = await divider.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(handle && viewport);
  const x = handle.x + handle.width / 2;
  const y = (Math.max(0, handle.y) + Math.min(viewport.height, handle.y + handle.height)) / 2;
  const beforeDrag = await page.locator('.today-list-panel').evaluate((element) => element.getBoundingClientRect().width);
  const assistant = page.locator('.today-action-shortcuts');
  const assistantWidth = () => assistant.evaluate((element) => element.getBoundingClientRect().width);
  const beforeAssistant = await assistantWidth();
  await page.mouse.move(x, y);
  await page.mouse.down();
  let draggedAssistant: number;
  try {
    await divider.and(page.locator('.today-split-handle-dragging')).waitFor({ timeout: 2_000 });
    await page.mouse.move(x - 100, y, { steps: 5 });
    await page.waitForFunction(({ listWidth, assistantWidth: startAssistantWidth }) => {
      const list = document.querySelector('.today-list-panel');
      const helper = document.querySelector('.today-action-shortcuts');
      return list !== null && helper !== null &&
        list.getBoundingClientRect().width < listWidth - 45 && helper.getBoundingClientRect().width > startAssistantWidth + 45;
    }, { listWidth: beforeDrag, assistantWidth: beforeAssistant }, { timeout: 2_000 });
    draggedAssistant = await assistantWidth();
  } finally {
    await page.mouse.up();
  }
  assert.ok(Math.abs(await assistantWidth() - draggedAssistant) <= 1, '松手后保留两栏留白和助手宽度');
  await page.evaluate(() => window.scrollTo(0, 0));
  await divider.dblclick({ position: { x: handle.width / 2, y: 64 } });
}

async function measureTodayLayout(page: Page) {
  return page.locator('.today-workspace-screen').evaluate((workspace) => {
    const edges = (selector: string) => {
      const bounds = workspace.querySelector(selector)?.getBoundingClientRect();
      return bounds === undefined ? undefined : { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width };
    };
    return {
      tabs: edges('.today-section-switch .ant-tabs-nav-list'), cutoff: edges('.procurement-cutoff'),
      results: edges('.today-workspace-results'), shortcuts: edges('.today-action-shortcuts'),
      row: edges('.today-workspace-results :is(.today-work-card, .today-task-row)'),
    };
  });
}

async function checkBatchPriorityFilter(page: Page) {
  const priority = page.getByRole('radiogroup', { name: '批次优先范围', exact: true });
  const overdue = page.getByRole('article', { name: /^UI-DEMO-001/ });
  const undated = page.getByRole('article', { name: /^UI-DEMO-002/ });
  await priority.getByRole('radio', { name: '优先', exact: true }).press('Space');
  await page.waitForURL((url) => url.searchParams.has('reasons'));
  await undated.waitFor({ state: 'hidden' });
  await overdue.waitFor();
  await page.setViewportSize({ width: 320, height: 900 });
  const tools = page.getByRole('button', { name: '待办操作', exact: true });
  await checkQuickMenuDismissal(page, '待办操作');
  await tools.press('Enter');
  await page.getByRole('menuitem', { name: '查看全部待办', exact: true }).press('Enter');
  await undated.waitFor();
  await tools.press('Enter');
  await page.getByRole('menuitem', { name: '只看优先批次', exact: true }).press('Enter');
  await undated.waitFor({ state: 'hidden' });
  await overdue.waitFor();
  await page.setViewportSize({ width: 1920, height: 900 });
  await priority.getByRole('radio', { name: '全部', exact: true }).press('Space');
  await undated.waitFor();
}

async function checkQuickMenuDismissal(page: Page, label: string | RegExp) {
  const trigger = page.getByRole('button', { name: label, exact: true });
  await trigger.press('Enter');
  await page.keyboard.press('Escape');
  await page.locator('.today-workspace-menu').waitFor({ state: 'hidden' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.ok(await trigger.evaluate((button) => button === document.activeElement), `${label}关闭后焦点回到原按钮`);
}

async function checkTodayLayouts(page: Page, out: string, view: 'action-board' | 'daily-schedule') {
  for (const width of todayWidths) {
    await page.setViewportSize({ width, height: 900 });
    // The responsive shell changes navigation after the browser's resize event.
    await page.getByRole('button', { name: '打开菜单', exact: true }).waitFor({ state: width < 768 ? 'visible' : 'hidden' });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const { tabs, cutoff, results, shortcuts, row } = await measureTodayLayout(page);
    assert.ok(tabs && cutoff && results && shortcuts && row);
    if (width >= 1280) {
      assert.ok(tabs.right < cutoff.left && cutoff.top < tabs.bottom && cutoff.bottom > tabs.top, '截止日期在页签行右侧');
      assert.deepEqual([results.top, results.bottom], [shortcuts.top, shortcuts.bottom], '待办与辅助区上下对齐');
      assert.ok(results.right < shortcuts.left);
    } else {
      assert.ok(results.bottom <= shortcuts.top, '窄屏先读待办，再读辅助区');
    }
    assert.ok(row.left >= results.left && row.right <= results.right);
    await page.screenshot({ path: join(out, `${view}-${width}.png`), animations: 'disabled' });
  }
}

async function checkCalendarBesideResults(page: Page): Promise<void> {
  const calendar = await page.getByRole('region', { name: '工作台日历' }).boundingBox();
  const results = await page.locator('.today-workspace-results').boundingBox();
  assert.ok(calendar !== null && results !== null);
  assert.ok(calendar.x + calendar.width < results.x, '宽屏月历与所选日期的待办并排');
  assert.equal(calendar.y, results.y);
  assert.equal(calendar.y + calendar.height, results.y + results.height);
  const resultTitle = page.locator('.today-calendar-results').getByRole('heading', { level: 2 });
  const originalDate = await resultTitle.innerText();
  const originalUrl = page.url();
  const month = page.getByRole('textbox', { name: '选择日历月份' });
  const originalMonth = await month.inputValue();
  await page.getByRole('button', { name: '下月', exact: true }).click();
  assert.notEqual(await month.inputValue(), originalMonth);
  assert.equal(await resultTitle.innerText(), originalDate);
  assert.equal(page.url(), originalUrl);
  await page.getByRole('button', { name: '上月', exact: true }).click();
  assert.equal(await month.inputValue(), originalMonth);
}

async function checkArrivals(page: Page): Promise<void> {
  await (await sidebarLink(page.locator('aside'), '今日事项', '在途待收')).click();
  await page.getByRole('heading', { name: '待收批次', exact: true }).waitFor();
  await page.getByText('UI-DEMO-004', { exact: false }).first().waitFor();
}

async function checkDailySchedule(page: Page): Promise<void> {
  await page.getByRole('link', { name: '返回个人工作台', exact: true }).click();
  const scheduleTab = page.getByRole('main').getByRole('tab', { name: '今日排期', exact: true });
  await scheduleTab.press('Enter');
  await page.waitForURL((url) => url.pathname === '/today' && url.searchParams.get('group') === 'schedule');
  const task = page.getByRole('button', { name: /确认今日出货/ });
  await task.waitFor();
  await page.getByRole('button', { name: /核实逾期包材/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /明日复核|已完成确认/ }).count(), 0);
  const grouping = page.getByRole('radiogroup', { name: '今日排期分组', exact: true });
  await grouping.getByRole('radio', { name: '供应商', exact: true }).press('Space');
  await page.waitForURL((url) => url.searchParams.get('group') === 'supplier');
  await task.getByText('今日到期', { exact: true }).waitFor();
  await task.press('Enter');
  const detail = page.getByRole('dialog', { name: /确认今日出货/ });
  await detail.getByText(/核实逾期包材.*仍阻塞/).waitFor();
  await page.keyboard.press('Escape');
  await detail.waitFor({ state: 'hidden' });
  await task.and(page.locator(':focus')).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('group'), 'supplier');
  await grouping.getByRole('radio', { name: '排期', exact: true }).press('Space');
  await page.waitForURL((url) => url.searchParams.get('group') === 'schedule');
  await page.getByRole('heading', { name: '今天到期', exact: true }).waitFor();
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
  const tabs = page.getByRole('tablist', { name: '产品详情内容' });
  await tabs.getByRole('tab', { name: '采购', exact: true }).click();
  await page.getByText('采购 4 行', { exact: true }).waitFor();
  await page.getByRole('radio', { name: '全部渠道', exact: true }).press('ArrowRight');
  await page.getByText('采购 2 行', { exact: true }).waitFor();
  const exact = page.getByRole('radio', { name: '只看本条码', exact: true });
  assert.ok(await exact.isChecked() && await exact.evaluate((node) => node === document.activeElement));
  await tabs.getByRole('tab', { name: '库存', exact: true }).click();
  await page.reload();
  await page.getByRole('tabpanel', { name: '库存', exact: true }).waitFor();
  const breadcrumb = page.getByRole('banner').getByRole('navigation', { name: '当前位置' });
  assert.deepEqual(await breadcrumb.locator('.ant-breadcrumb-link').allTextContents(), ['产品档案', '产品详情', '库存']);
  await page.getByText('库存 1 行', { exact: true }).waitFor();
  const stock = await page.request.get(new URL('/api/v1/products/ui-demo-cleanser/stock', page.url()).href);
  assert.equal((await stock.json()).factory.total.value, 320);
  const source = await page.request.get(new URL('/api/v1/imports/ui-demo-stock-batch', page.url()).href);
  assert.equal(source.status(), 200);
  await tabs.getByRole('tab', { name: '组成物料', exact: true }).click();
  await page.getByText('子件 2', { exact: true }).waitFor();
  await page.goto(new URL(cream, page.url()).href);
  await tabs.getByRole('tab', { name: '组成物料', exact: true }).click();
  await page.getByText('没有 BOM', { exact: true }).waitFor();
}

async function checkProductSearch(page: Page, origin: URL): Promise<void> {
  const barcode = '2099000000200';
  await page.goto(new URL('/products?view=table', origin).href);
  const search = page.getByRole('searchbox', { name: '品名或条码', exact: true }).or(page.getByRole('textbox', { name: '品名或条码', exact: true }));
  await search.fill(barcode);
  await search.press('Enter');
  await page.waitForURL((url) => url.searchParams.get('q') === barcode);
  await page.reload();
  await search.waitFor();
  assert.equal(await search.inputValue(), barcode);
  const matched = page.locator(`a[href="${cream}"]`);
  await matched.waitFor();
  assert.equal(await page.locator(`a[href="${cleanser}"]`).count(), 0);
  await matched.click();
  await page.getByText('返回产品档案', { exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/products' && url.searchParams.get('q') === barcode && url.searchParams.get('view') === 'table');
  await search.fill('验收不存在的条码');
  await search.press('Enter');
  await page.getByText('没有符合条件的产品。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '清除搜索', exact: true }).click();
  await page.locator(`a[href="${cleanser}"]`).waitFor();
  await page.goto(new URL('/products?page=99', origin).href);
  await page.getByRole('button', { name: '返回第一页' }).press('Enter');
  await page.locator(`a[href="${cleanser}"]`).waitFor();
  assert.ok(await page.getByRole('region', { name: '产品查询结果' }).evaluate((node) => document.activeElement === node));
}

async function checkProductPackagingReturn(page: Page, origin: URL): Promise<void> {
  const barcode = '2099000000101';
  for (const { width, view } of [{ width: 1440, view: 'card' }, { width: 390, view: 'table' }]) {
    await page.setViewportSize({ width, height: 900 });
    const source = new URL(`/products?q=${barcode}&view=${view}`, origin);
    await page.goto(source.href);
    const results = page.getByRole('region', { name: '产品查询结果', exact: true });
    const channel = results.locator(`a[href="${cleanser}-channel"]`);
    await results.getByText('标准规格', { exact: true }).waitFor();
    await results.getByText('渠道规格', { exact: true }).waitFor();
    await results.getByText(/24 件\/箱/).waitFor();
    await results.getByText(/12 件\/箱/).waitFor();
    await channel.press('Enter');
    await page.getByRole('heading', { name: '产品 演示净润洁面乳渠道装', exact: true }).waitFor();
    for (const text of ['渠道规格', `${barcode}-1`, '100 mL', '12 件/箱']) {
      await page.getByText(text, { exact: true }).waitFor();
    }
    await page.reload();
    if (view === 'card') {
      await page.getByRole('tab', { name: '采购', exact: true }).press('Enter');
      await page.getByRole('link', { name: '返回产品档案', exact: true }).press('Enter');
    } else {
      await page.goBack();
    }
    await page.waitForURL(source.href);
    await channel.and(page.locator(':focus')).waitFor();
    const search = page.getByLabel('品名或条码', { exact: true });
    assert.equal(await search.inputValue(), barcode);
    assert.ok(await page.getByRole('radio', { name: view === 'card' ? '卡片' : '表格', exact: true }).isChecked());
    assert.ok(await page.evaluate((viewportWidth) => document.documentElement.scrollWidth <= viewportWidth, width));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
