import assert from 'node:assert/strict';
import type { Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';

const GROUP_LABEL = '导入与审核';
const IMPORT_LABEL = '导入中心';
const MASTER_LABEL = '主数据';
const HISTORY_PATH = '/imports?template=po-master-v1&status=committed';
const EMPTY_SCHEDULE = '/progress?view=schedule&from=2030-01-01';
const WORKBOOK = 'po-master-procurement.xlsx';
const SETTINGS_LABEL = '系统设置';

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
  await checkReviewNavigation(admin, origin, 6);
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
    buyerEntries: 5, adminEntries: 6, legacyBatch, reviewPhoneWidth: 320, deniedRoles: ['manager', 'lead'],
    settings: { soleAdminLanding: '/settings', keyboardLink: true, phoneWidth: 320, deniedRoles: settingsDeniedRoles },
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

  await page.getByRole('complementary').getByRole('link', { name: '今日', exact: true }).click();
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
  assert.equal(await drawer.getByRole('link').count(), 6);
  assert.equal(await drawer.locator('a[href="/settings"]').count(), 0);
  await drawer.getByRole('link', { name: '今日', exact: true }).click();
  await drawer.waitFor({ state: 'hidden' });
  await trigger.click();
  await settings.click();
  await page.waitForURL(settingsUrl);
  await heading.waitFor();
  await settings.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function checkWithoutSettingsAccess(page: Page, origin: URL, name: string): Promise<void> {
  await page.goto(new URL('/settings', origin).href);
  await page.getByRole('heading', { name: '这个角色看不到这页。', exact: true }).waitFor();
  const trigger = page.getByRole('banner').getByRole('button', { name, exact: true });
  await trigger.click();
  await page.getByRole('menuitem', { name: /退出/ }).waitFor();
  assert.equal(await page.getByRole('link', { name: SETTINGS_LABEL, exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
}

async function checkBuyerNavigation(page: Page, origin: URL): Promise<string> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL('/today', origin).href);
  const sidebar = page.locator('aside');
  await sidebar.getByRole('link', { name: IMPORT_LABEL, exact: true }).click();
  await page.waitForURL(new URL('/imports', origin).href);
  await page.getByRole('heading', { name: IMPORT_LABEL, exact: true }).waitFor();
  await page.getByRole('button', { name: '开始解析', exact: true }).waitFor();
  assert.equal(await sidebar.getByRole('link').count(), 5);
  assert.equal(await page.getByRole('navigation', { name: GROUP_LABEL }).count(), 0);
  const headerLink = page.getByRole('banner').locator('a[href="/imports"]');
  await headerLink.getByText(/总表/).waitFor();

  await checkEmptySchedule(page, origin, true);
  await page.goto(new URL(HISTORY_PATH, origin).href);
  const historyLink = page.getByRole('link', { name: WORKBOOK, exact: true });
  await historyLink.waitFor();
  const legacyBatch = await historyLink.getAttribute('href');
  assert.ok(legacyBatch?.startsWith('/imports/'));
  await checkLegacyBatch(page, legacyBatch, origin, IMPORT_LABEL);
  return legacyBatch;
}

async function checkReviewNavigation(page: Page, origin: URL, expectedEntries: number): Promise<void> {
  const sidebar = page.locator('aside');
  await sidebar.getByRole('link', { name: GROUP_LABEL, exact: true }).click();
  await page.waitForURL(new URL('/imports', origin).href);
  assert.equal(await sidebar.getByRole('link').count(), expectedEntries);
  assert.equal(await sidebar.getByRole('link', { name: MASTER_LABEL, exact: true }).count(), 0);
  const selected = sidebar.locator('.ant-menu-item-selected').getByRole('link', { name: GROUP_LABEL, exact: true });
  const group = page.getByRole('navigation', { name: GROUP_LABEL });
  const imports = group.getByRole('link', { name: IMPORT_LABEL, exact: true });
  const master = group.getByRole('link', { name: MASTER_LABEL, exact: true });
  await imports.waitFor();
  assert.equal(await imports.getAttribute('aria-current'), 'page');
  await selected.waitFor();
  await master.click();
  await page.waitForURL(new URL('/master', origin).href);
  await page.getByRole('tab', { name: '别名审核', exact: true }).waitFor();
  assert.equal(await master.getAttribute('aria-current'), 'page');
  await selected.waitFor();
  await imports.click();
  await page.waitForURL(new URL('/imports', origin).href);
}

async function checkReviewPhone(page: Page, origin: URL): Promise<void> {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.getByRole('navigation', { name: GROUP_LABEL }).getByRole('link', { name: MASTER_LABEL, exact: true }).click();
  await page.waitForURL(new URL('/master', origin).href);
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '导航', exact: true });
  await drawer.locator('.ant-menu-item-selected').getByRole('link', { name: GROUP_LABEL, exact: true }).click();
  await page.waitForURL(new URL('/imports', origin).href);
  await drawer.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function checkLegacyBatch(page: Page, legacyBatch: string, origin: URL, sidebarLabel = GROUP_LABEL): Promise<void> {
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
  const header = page.getByRole('banner');
  await header.getByText(/总表/).waitFor();
  assert.equal(await header.locator('a[href="/imports"]').count(), 0);
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

async function checkEmptySchedule(page: Page, origin: URL, canReadImports: boolean): Promise<void> {
  await page.goto(new URL(EMPTY_SCHEDULE, origin).href);
  await page.getByText('本周没有排期任务。', { exact: true }).waitFor();
  const link = page.getByRole('link', { name: '去导入排期里程碑', exact: true });
  assert.equal(await link.count(), canReadImports ? 1 : 0);
}
