import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { sidebarEntries, sidebarGroup, sidebarLink } from './sidebar.ts';

const GROUP_LABEL = '导入与审核';
const IMPORT_LABEL = '导入中心';
const MASTER_LABEL = '别名审核';
const HISTORY_PATH = '/imports?template=po-master-v1&status=committed';
const EMPTY_SCHEDULE = '/progress?view=schedule&from=2030-01-01';
const WORKBOOK = 'po-master-procurement.xlsx';
const SETTINGS_LABEL = '系统设置';
const SEARCH_LABEL = '搜索单号、品名、供应商';
const ADMIN_NAV_ENTRIES = 7;

export async function checkEmptyProductArchive(page: Page, origin: URL, canReadImports: boolean): Promise<void> {
  await page.goto(new URL('/products', origin).href);
  await page.getByText('还没有产品档案。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: '去导入', exact: true }).count(), canReadImports ? 1 : 0);
}

export async function checkImportReviewNavigation({ admin, buyer, lead, manager, reviewer, origin }: {
  readonly admin: Page;
  readonly buyer: Page;
  readonly lead: Page;
  readonly manager: Page;
  readonly reviewer: Page;
  readonly origin: URL;
}) {
  await checkAdminSettings(admin, origin);
  const legacyBatch = await checkBuyerNavigation(buyer, origin);
  await checkReviewNavigation(admin, origin, ADMIN_NAV_ENTRIES);
  await checkReviewNavigation(reviewer, origin, 5);
  await checkReviewPhone(reviewer, origin);
  await checkLegacyBatch(admin, legacyBatch, origin);
  await checkLegacyBatch(reviewer, legacyBatch, origin);
  await checkWithoutImportAccess(manager, origin, legacyBatch);
  await checkWithoutImportAccess(lead, origin, legacyBatch);
  const settingsDeniedRoles = ['buyer', 'reviewer', 'manager', 'lead'] as const;
  const accounts = { buyer: [buyer, '采购甲'], reviewer: [reviewer, '审核人甲'], manager: [manager, '管理层甲'], lead: [lead, '负责人甲'] } as const;
  for (const role of settingsDeniedRoles) {
    const [page, name] = accounts[role];
    await checkWithoutSettingsAccess(page, origin, name);
  }
  return {
    buyerEntries: 5, adminEntries: ADMIN_NAV_ENTRIES, legacyBatch, historyFocus: true, keyboardFilePicker: true,
    reviewPhoneWidth: 320, deniedRoles: ['manager', 'lead'],
    settings: { soleAdminLanding: '/settings', keyboardLink: true, phoneWidth: 320, deniedRoles: settingsDeniedRoles },
    header: { alignmentWidths: [1440, 320], phoneTargetPx: 44, phoneSearchLabel: '搜索', roleTag: true, keyboardLogout: true },
  };
}

async function checkAdminSettings(page: Page, origin: URL): Promise<void> {
  const settingsUrl = new URL('/settings', origin).href;
  const trigger = page.getByRole('banner').getByRole('button', { name: '管理员', exact: true });
  const settings = page.getByRole('link', { name: SETTINGS_LABEL, exact: true });
  const heading = page.getByRole('heading', { name: '设置', exact: true });
  assert.equal(page.url(), settingsUrl);
  await heading.waitFor();
  assert.equal(await page.locator('aside a[href="/settings"]').count(), 0);

  await page.getByRole('complementary').getByRole('link', { name: '今日事项', exact: true }).click();
  await page.waitForURL(new URL('/today', origin).href);
  await trigger.press('Enter');
  await settings.waitFor();
  assert.equal(await settings.getAttribute('href'), '/settings');
  await page.keyboard.press('Tab');
  assert.equal(await settings.evaluate((link) => link === document.activeElement), true);
  await page.keyboard.press('Enter');
  await page.waitForURL(settingsUrl);
  await heading.waitFor();
  await settings.waitFor({ state: 'hidden' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');

  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto(new URL('/today', origin).href);
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '导航', exact: true });
  await drawer.waitFor();
  const entries = sidebarEntries(drawer);
  assert.equal(await entries.count(), ADMIN_NAV_ENTRIES);
  await entries.first().getByRole('link', { name: '首页', exact: true }).waitFor();
  assert.equal(await drawer.locator('a[href="/settings"]').count(), 0);
  await drawer.getByRole('link', { name: '今日事项', exact: true }).click();
  await drawer.waitFor({ state: 'hidden' });
  await trigger.click();
  await settings.click();
  await page.waitForURL(settingsUrl);
  await heading.waitFor();
  await settings.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await checkAccountFocusExit(page, origin);
}

async function checkAccountFocusExit(page: Page, origin: URL) {
  const header = page.getByRole('banner');
  const trigger = header.getByRole('button', { name: '管理员', exact: true });
  const search = header.getByRole('button', { name: SEARCH_LABEL, exact: true });
  const navigation = header.getByRole('button', { name: '打开菜单', exact: true });
  const settings = header.getByRole('link', { name: SETTINGS_LABEL, exact: true });
  const logout = header.getByRole('button', { name: '退出', exact: true });
  const reportDate = page.getByLabel('周一', { exact: true });
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(new URL('/reports', origin).href);
    await reportDate.waitFor();
    const [searchBox, accountBox] = await Promise.all([search.boundingBox(), trigger.boundingBox()]);
    assert.ok(searchBox && accountBox, '顶栏应显示搜索和账户入口');
    assert.ok(Math.abs((searchBox.y + searchBox.height / 2) - (accountBox.y + accountBox.height / 2)) <= 1, '搜索和账户入口应沿垂直中心对齐');
    assert.equal(searchBox.height, accountBox.height, '搜索和账户入口应等高');
    if (width === 320) {
      const navBox = await navigation.boundingBox();
      assert.ok(navBox, '手机顶栏应显示菜单入口');
      for (const box of [navBox, searchBox, accountBox]) {
        assert.ok(box.width >= 44 && box.height >= 44, '手机顶栏的点击区应至少为 44 × 44');
      }
    }
    await trigger.press('Enter');
    await settings.waitFor();
    await logout.waitFor();
    await header.locator('.ant-tag').filter({ hasText: /^管理员$/u }).waitFor();
    const [settingsHeight, logoutHeight] = await Promise.all([
      settings.evaluate((link) => 'offsetHeight' in link && link.offsetHeight),
      logout.evaluate((button) => 'offsetHeight' in button && button.offsetHeight),
    ]);
    assert.ok(settingsHeight && logoutHeight, '账户菜单应显示系统设置和退出');
    assert.equal(settingsHeight, logoutHeight, '系统设置和退出应等高');
    if (width === 320) assert.ok(logoutHeight >= 44, '手机账户菜单操作应至少 44 高');
    for (const _step of [1, 2, 3]) await page.keyboard.press('Tab');
    assert.equal(await reportDate.evaluate((input) => input === document.activeElement), true);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false', '焦点移到页面时账户菜单应关闭');
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement?.closest('main')), '继续 Tab 应留在页面内容');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function checkWithoutSettingsAccess(page: Page, origin: URL, name: string): Promise<void> {
  await page.goto(new URL('/settings', origin).href);
  await page.getByRole('heading', { name: '这个角色看不到这页。', exact: true }).waitFor();
  const trigger = page.getByRole('banner').getByRole('button', { name, exact: true });
  const logout = page.getByRole('button', { name: '退出', exact: true });
  const focused = page.locator(':focus');
  await trigger.press('Enter');
  await logout.waitFor();
  assert.equal(await page.getByRole('link', { name: SETTINGS_LABEL, exact: true }).count(), 0);
  await page.keyboard.press('Tab');
  await logout.and(focused).waitFor();
  await page.keyboard.press('Shift+Tab');
  await trigger.and(focused).waitFor();
  await page.keyboard.press('Tab');
  await logout.and(focused).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  await trigger.and(focused).waitFor();
}

export async function checkAccountLogout(page: Page, origin: URL, expectFailure: (path: string) => void) {
  const today = new URL('/today', origin);
  const session = new URL('/api/v1/me', origin).href;
  const logoutUrl = new URL('/api/v1/auth/logout', origin);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto(today.href);
  const header = page.getByRole('banner');
  const trigger = header.getByRole('button', { name: '采购甲', exact: true });
  const logout = header.getByRole('button', { name: '退出', exact: true });
  const focused = page.locator(':focus');
  await trigger.press('Enter');
  await logout.waitFor();
  await page.keyboard.press('Tab');
  await logout.and(focused).waitFor();

  expectFailure(logoutUrl.pathname);
  await page.route(logoutUrl.href, (route) => route.fulfill({
    status: 503,
    json: { error: { code: 'INTERNAL', message: '验收模拟退出失败', details: {} } },
  }), { times: 1 });
  const failed = page.waitForResponse((response) => response.url() === logoutUrl.href && response.request().method() === 'POST');
  await page.keyboard.press('Space');
  assert.equal((await failed).status(), 503);
  await page.getByText('退出没有完成', { exact: true }).waitFor();
  await trigger.and(focused).waitFor();
  assert.equal(page.url(), today.href);
  assert.equal((await page.request.get(session)).status(), 200);

  await page.keyboard.press('Enter');
  await logout.waitFor();
  await page.keyboard.press('Tab');
  await logout.and(focused).waitFor();
  const retry = page.waitForResponse((response) => response.url() === logoutUrl.href && response.request().method() === 'POST');
  await page.keyboard.press('Enter');
  assert.equal((await retry).status(), 204);
  await page.waitForURL(new URL('/login', origin).href);
  await page.getByRole('heading', { name: '供应链工作台登录', exact: true }).waitFor();
  assert.equal((await page.request.get(session)).status(), 401);
  return { failedStatus: 503, sessionAfterFailure: 200, retryStatus: 204, sessionAfterLogout: 401, landing: '/login' };
}

async function checkBuyerNavigation(page: Page, origin: URL): Promise<string> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL('/today', origin).href);
  const sidebar = page.locator('aside');
  await sidebar.getByRole('link', { name: IMPORT_LABEL, exact: true }).click();
  await page.waitForURL(new URL('/imports', origin).href);
  await page.getByRole('heading', { name: IMPORT_LABEL, exact: true }).waitFor();
  await page.getByRole('button', { name: '开始解析', exact: true }).waitFor();
  assert.equal(await sidebarEntries(sidebar).count(), 5);
  assert.equal(await page.getByRole('navigation', { name: GROUP_LABEL }).count(), 0);
  const historyFilters = page.getByRole('search', { name: '导入批次历史筛选' });
  await checkProcurementCutoff(page, historyFilters.getByText(/^\*数据截止/u), historyFilters.getByLabel('筛选批次状态'));
  await checkKeyboardFilePicker(page);

  await checkEmptySchedule(page, origin, true);
  await page.goto(new URL(HISTORY_PATH, origin).href);
  const historyLink = page.getByRole('link', { name: WORKBOOK, exact: true });
  await historyLink.waitFor();
  const legacyBatch = await historyLink.getAttribute('href');
  assert.ok(legacyBatch?.startsWith('/imports/'));
  await checkHistoryReturn(page, origin);
  await checkLegacyBatch(page, legacyBatch, origin, IMPORT_LABEL);
  return legacyBatch;
}

async function checkKeyboardFilePicker(page: Page): Promise<void> {
  const upload = page.getByRole('main').getByRole('button', { name: /^选择文件/ });
  assert.equal(await upload.count(), 1, '只能有一个键盘文件选择入口');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), upload.press('Enter')]);
  await chooser.setFiles(fileURLToPath(new URL(`../fixtures/synthetic/${WORKBOOK}`, import.meta.url)));
  await page.getByRole('status').filter({ hasText: `已选文件 ${WORKBOOK}` }).waitFor();
  await page.getByRole('combobox', { name: '导入类型', exact: true }).waitFor();
  const replace = page.getByRole('button', { name: '更换文件', exact: true });
  await replace.focus();
  await page.keyboard.press('Tab');
  await page.getByRole('link', { name: '下载采购订单总表模板', exact: true }).and(page.locator(':focus')).waitFor();
}

async function checkHistoryReturn(page: Page, origin: URL): Promise<void> {
  const link = page.getByRole('link', { name: WORKBOOK, exact: true });
  for (const mode of ['link', 'browser']) {
    await link.press('Enter');
    await page.getByText(/已提交 · 共 \d+ 行/).waitFor();
    if (mode === 'link') await page.getByRole('link', { name: '返回导入中心', exact: true }).press('Enter');
    else await page.goBack();
    await page.waitForURL(new URL(HISTORY_PATH, origin).href);
    await link.and(page.locator(':focus')).waitFor();
    await page.getByRole('combobox', { name: '筛选批次状态', exact: true }).waitFor();
    await page.getByText('已提交', { exact: true }).first().waitFor();
  }
}

export async function checkImportFactoryDetail(page: Page, origin: URL) {
  const source = new URL('/imports?template=factory-progress-v1&status=committed', origin);
  await page.goto(source.href);
  const batch = page.getByRole('link', { name: 'ui-demo-stock-file', exact: true });
  await batch.waitFor();
  await page.getByText(/代工厂进度 · 演示包装工厂/).waitFor();
  await batch.press('Enter');
  await page.getByText('演示包装工厂', { exact: true }).waitFor();
  await page.getByRole('heading', { name: '提交结果', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('link', { name: '返回导入中心', exact: true }).press('Enter');
  await page.waitForURL(source.href);
  await batch.and(page.locator(':focus')).waitFor();
  return { factory: '演示包装工厂', status: '已提交', historyFocus: true };
}

async function checkReviewNavigation(page: Page, origin: URL, expectedEntries: number): Promise<void> {
  const sidebar = page.locator('aside');
  const imports = await sidebarLink(sidebar, GROUP_LABEL, IMPORT_LABEL);
  const selected = sidebar.locator('[aria-current="page"]');
  await imports.click();
  await page.waitForURL(new URL('/imports', origin).href);
  assert.equal(await sidebarEntries(sidebar).count(), expectedEntries);
  const group = sidebarGroup(sidebar, GROUP_LABEL);
  const master = sidebar.getByRole('link', { name: MASTER_LABEL, exact: true });
  await imports.and(selected).waitFor();
  assert.equal(await group.getAttribute('aria-expanded'), 'true');
  await master.click();
  await page.waitForURL(new URL('/master', origin).href);
  await page.getByRole('heading', { name: MASTER_LABEL, exact: true, level: 1 }).waitFor();
  await master.and(selected).waitFor();
  assert.equal(await page.getByRole('main').getByRole('tab').count(), 0);
  await imports.click();
  await page.waitForURL(new URL('/imports', origin).href);
}

async function checkReviewPhone(page: Page, origin: URL): Promise<void> {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '导航', exact: true });
  await drawer.getByRole('link', { name: MASTER_LABEL, exact: true }).click();
  await page.waitForURL(new URL('/master', origin).href);
  await drawer.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await drawer.getByRole('link', { name: IMPORT_LABEL, exact: true }).click();
  await page.waitForURL(new URL('/imports', origin).href);
  await drawer.waitFor({ state: 'hidden' });

  const search = page.getByRole('banner').getByRole('button', { name: SEARCH_LABEL, exact: true });
  const label = search.getByText('搜索', { exact: true });
  await label.waitFor();
  assert.equal(await search.getByText(/Ctrl\+K|⌘K/u).count(), 0);
  const [labelBox, searchBox] = await Promise.all([label.boundingBox(), search.boundingBox()]);
  assert.ok(labelBox && searchBox, '手机应显示搜索按钮及文案');
  assert.ok(labelBox.x >= searchBox.x && labelBox.x + labelBox.width <= searchBox.x + searchBox.width
    && labelBox.y >= searchBox.y && labelBox.y + labelBox.height <= searchBox.y + searchBox.height,
  '320 px 下搜索文案应完整处于按钮内');
  await search.click();
  const dialog = page.getByRole('dialog', { name: '搜索', exact: true });
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await checkWithoutSettingsAccess(page, origin, '审核人甲');
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function checkLegacyBatch(page: Page, legacyBatch: string, origin: URL, sidebarLabel = IMPORT_LABEL): Promise<void> {
  const batchUrl = new URL(legacyBatch, origin);
  await page.goto(batchUrl.href);
  const back = page.getByRole('link', { name: '返回导入中心', exact: true });
  await page.getByText(/已提交 · 共 \d+ 行/).waitFor();
  assert.equal(await back.getAttribute('href'), HISTORY_PATH);
  await page.locator('aside .ant-menu-item-selected').getByRole('link', { name: sidebarLabel, exact: true }).waitFor();
}

async function checkWithoutImportAccess(page: Page, origin: URL, legacyBatch: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await checkEmptySchedule(page, origin, false);
  await checkProcurementCutoff(page, page.getByText(/^\*数据截止/u), page.getByRole('combobox', { name: '店铺', exact: true }));
  assert.equal(await page.locator('aside a[href="/imports"], aside a[href="/master"]').count(), 0);

  const batchPath = new URL(legacyBatch, origin).pathname;
  for (const path of ['/imports', legacyBatch, '/master']) {
    await page.goto(new URL(path, origin).href);
    await page.getByRole('heading', { name: '这个角色看不到这页。', exact: true }).waitFor();
  }
  for (const path of ['/imports', batchPath, '/master/review-queue/counts']) {
    assert.equal((await page.request.get(new URL('/api/v1' + path, origin).href)).status(), 403);
  }
}

async function checkProcurementCutoff(page: Page, cutoff: Locator, filter: Locator) {
  await cutoff.getByText(/^\d{4}-\d{2}-\d{2}$/u).waitFor();
  const banner = page.getByRole('banner');
  assert.equal(await banner.getByText(/采购订单总表|数据截止/u).count(), 0);
  assert.equal(await banner.locator('a[href="/imports"]').count(), 0);
  const [date, control] = await Promise.all([cutoff.boundingBox(), filter.boundingBox()]);
  assert.ok(date && control && date.x >= control.x + control.width);
  assert.ok(date.y < control.y + control.height && control.y < date.y + date.height, '截止日期和筛选控件在同一行');
}

async function checkEmptySchedule(page: Page, origin: URL, canReadImports: boolean): Promise<void> {
  await page.goto(new URL(EMPTY_SCHEDULE, origin).href);
  await page.getByText('所选期间没有排期任务。', { exact: true }).waitFor();
  const link = page.getByRole('link', { name: '去导入排期里程碑', exact: true });
  assert.equal(await link.count(), canReadImports ? 1 : 0);
}
