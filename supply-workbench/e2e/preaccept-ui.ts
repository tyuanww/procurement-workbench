import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { browserFailureLocation, failureMessage, writeAcceptanceJson } from './acceptance-diagnostics.ts';
import { checkConfirmedArrivalDownload } from './confirmed-arrival-acceptance.ts';
import { checkFactoryLinkBoard } from './factory-link-acceptance.ts';
import { checkFollowUpDelivery } from './follow-up-delivery-acceptance.ts';
import { checkFollowUpOrderQuery } from './follow-up-order-query-acceptance.ts';
import { checkCrossPageFulfillment } from './cross-page-fulfillment-acceptance.ts';
import { checkFrontendCloseout } from './frontend-closeout-acceptance.ts';
import { checkAccountLogout, checkEmptyProductArchive, checkImportFactoryDetail, checkImportReviewNavigation } from './import-review-navigation-acceptance.ts';
import { checkPersonalWorkspace } from './personal-workspace-acceptance.ts';
import { checkDirectorHome, checkManagementMeeting, checkOrderLineNote, checkProductDevelopment, checkStoreSchedule } from './procurement-mainline-acceptance.ts';
import { checkPoMasterTemplate } from './po-master-template-acceptance.ts';
import { checkChaseToday, checkFirstBatch, checkKeyboardReceipt, checkTodayDrawer, seedChaseSample, seedDemoFixture } from './procurement-today-acceptance.ts';
import { addStuckSecondBatch, checkStuckRoundTrip, openStuckSecondBatch } from './stuck-follow-up-acceptance.ts';
import { checkRedReview } from './red-review-acceptance.ts';
import { sidebarGroup, sidebarLink } from './sidebar.ts';

const workbook = new URL('../fixtures/synthetic/po-master-procurement.xlsx', import.meta.url);
const workbookName = 'po-master-procurement.xlsx';
const componentCode = '99010003';
const componentPo = 'PO20261117009103';

const requireWeb = createRequire(new URL('../packages/report-renderers/package.json', import.meta.url));
const { chromium }: typeof import('../node_modules/.pnpm/node_modules/playwright/index.js') = requireWeb('playwright');
const xlsx: typeof import('../node_modules/.pnpm/node_modules/xlsx/types/index.js') = requireWeb('xlsx');
const origin = new URL(process.env.ACCEPT_API ?? 'http://127.0.0.1:8080');
assert.ok(origin.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(origin.hostname));
assert.equal(process.env.E2E_ALLOW_MUTATION, '1', '本用例创建合成订单行，只能使用隔离库');
const accessCode = process.env.DEV_ACCESS_CODE ?? '';
assert.ok(accessCode, '缺隔离库访问码');
const out = process.env.PREACCEPT_OUT ?? '';
assert.ok(out, '请设定证据目录 PREACCEPT_OUT');
const channel = process.env.ACCEPT_BROWSER ?? 'chrome';
assert.ok(['chrome', 'msedge'].includes(channel));
const users = {
  admin: '0199f0a0-0000-7000-8000-000000000001',
  buyer: '0199f0a0-0000-7000-8000-000000000002',
  buyerPeer: '0199f0a0-0000-7000-8000-000000000003',
  reviewer: '0199f0a0-0000-7000-8000-000000000004',
  manager: '0199f0a0-0000-7000-8000-000000000005',
  lead: '0199f0a0-0000-7000-8000-000000000006',
};
const warehouse = '0199f0a0-0000-7000-8000-000000000010';
const queuePath = '/api/v1/master/review-queue/counts';
const loginPath = '/api/v1/auth/dev/login';
const logoutPath = '/api/v1/auth/logout';
const todayPath = '/api/v1/today';
const searchLabel = '搜索单号、品名、供应商';
const headless = process.env.ACCEPT_HEADLESS !== '0';
const browser = await chromium.launch({ headless, channel });
type Role = keyof typeof users;
type BrowserElement = Element;
type ResponseRecord = { readonly role: Role; readonly session: number; readonly path: string; readonly status: number; readonly signedIn: boolean; readonly startedWithSession?: true };
type ExpectedFailure = Pick<ResponseRecord, 'role' | 'path' | 'status'>;
type AcceptanceResult = {
  readonly platform: typeof process.platform;
  readonly browser: string;
  readonly channel: string;
  readonly checks: Record<string, unknown>;
  readonly network: ResponseRecord[];
  readonly exceptions: { readonly role: Role; readonly text: string }[];
  result?: 'pass' | 'fail';
  failure?: string;
  failureAt?: string;
  cleanupFailure?: string;
};
const result: AcceptanceResult = { platform: process.platform, browser: browser.version(), channel, checks: {}, network: [], exceptions: [] };
const expectedFailures: ExpectedFailure[] = [];
let nextSession = 0;
await mkdir(out, { recursive: true });
const progressTimer = setInterval(() => {
  const checks = Object.keys(result.checks);
  console.log(JSON.stringify({ browserProgress: { elapsedMs: Math.round(process.uptime() * 1000),
    completedChecks: checks.length, lastCompleted: checks.at(-1) ?? null } }));
}, 30_000).unref();

try {
  await procurementAcceptance();
  const errors = unexpectedResponses(result.network);
  assert.deepEqual(errors, []);
  assert.deepEqual(result.exceptions, []);
  result.result = 'pass';
} catch (error) {
  recordFailure(error);
  await saveResult().catch((saveError: unknown) => console.error('Unable to persist the acceptance failure:', failureMessage(saveError)));
}
try {
  await browser.close();
} catch (error) {
  result.result = 'fail';
  result.cleanupFailure = failureMessage(error);
  console.error('Unable to close the acceptance browser:', result.cleanupFailure);
  process.exitCode = 1;
} finally {
  clearInterval(progressTimer);
  await saveResult();
}
console.log(JSON.stringify({ platform: result.platform, checks: Object.keys(result.checks), result: result.result,
  elapsedMs: Math.round(process.uptime() * 1000), failure: result.failure, failureAt: result.failureAt }));

async function saveResult(): Promise<void> {
  await writeAcceptanceJson(join(out, 'result.json'), result);
}

function recordFailure(error: unknown): void {
  result.result = 'fail';
  result.failure = failureMessage(error);
  result.failureAt = browserFailureLocation(error);
  console.error(JSON.stringify({ failure: result.failure, failureAt: result.failureAt }));
  process.exitCode = 1;
}

async function procurementAcceptance(): Promise<void> {
  seedChaseSample();
  const { page: buyer, entry, devtools: buyerDevtools } = await open('buyer', '/', '/today');
  await checkShell(buyer, entry);
  await buyer.getByRole('heading', { name: '个人工作台', exact: true }).waitFor();
  result.checks.todayDrawer = await checkTodayDrawer(buyer, origin);
  result.checks.procurementChase = await checkChaseToday({ page: buyer, origin, out });
  result.checks.receipt = await checkKeyboardReceipt({ page: buyer, origin, out });
  const { page: manager } = await open('manager', '/', '/home');
  await manager.getByRole('region', { name: '新品开发进度', exact: true }).waitFor();
  const directorMenu = manager.locator('aside');
  const home = await directorMenu.getByRole('link', { name: '首页', exact: true }).boundingBox();
  const today = sidebarGroup(directorMenu, '今日事项');
  const todayBox = await today.boundingBox();
  assert.ok(home && todayBox && home.y < todayBox.y, '首页应在今日事项上方');
  await checkEmptyProductArchive(buyer, origin, true);
  await checkEmptyProductArchive(manager, origin, false);
  result.checks.productArchiveImportLink = { buyer: true, manager: false };
  await checkImportRecovery(buyer);
  const importPath = await checkProcurementImport(buyer);
  await checkMobileOrders(buyer);
  await checkLineColumns(buyer);
  await checkNavigation(buyer);
  result.checks.partyOrderNavigation = await checkPartyOrderNavigation(buyer);
  result.checks.firstBatch = await checkFirstBatch({ page: buyer, origin, buyer: users.buyer, warehouse });

  const deep = '/lines?lane=material&q=' + componentPo + '#batch';
  const { page: deepBuyer } = await open('buyer', deep);
  await deepBuyer.getByRole('heading', { name: '跟进中心', exact: true }).waitFor();
  await deepBuyer.getByRole('link', { name: componentPo, exact: true }).waitFor();
  await buyer.goto(new URL('/reports', origin).href);
  await buyer.getByRole('heading', { name: '这个角色看不到这页。', exact: true }).waitFor();
  await buyer.goto(new URL('/home', origin).href);
  await buyer.getByRole('heading', { name: '这个角色看不到这页。', exact: true }).waitFor();
  assert.equal(await buyer.locator('aside').getByRole('link', { name: '首页', exact: true }).count(), 0);
  result.checks.procurementHome = { buyer: '/today', manager: '/home', restoredDeepLink: deep, forbiddenReports: true, forbiddenHome: true };
  result.checks.orderLineNote = await checkOrderLineNote({ page: buyer, manager, origin, out });

  const { page: reviewer, devtools } = await open('reviewer', '/', '/master');
  await checkImportReviewLink(reviewer, importPath);
  result.checks.storeSchedule = await checkStoreSchedule({ page: buyer, manager, origin, out });
  result.checks.productDevelopment = await checkProductDevelopment({ buyer, reviewer, buyerId: users.buyer, reviewerId: users.reviewer, origin, out });
  const meeting = await checkManagementMeeting({ page: manager, origin, out, materialPo: componentPo });
  result.checks.managementMeeting = meeting;
  result.checks.pageStories = await checkPageStories({ buyer, manager });
  const { page: lead } = await open('lead', '/', '/reports');
  result.checks.managementNavigation = await checkManagementNavigation({ manager, lead, buyer, reviewer, reportPath: meeting.frozenReport });
  const badge = sidebarGroup(reviewer.locator('aside'), '导入与审核').locator('.ant-badge');
  await badge.waitFor();
  const visibleCount = (await badge.innerText()).trim();
  assert.match(visibleCount, /^[1-9]\d*\+?$/);
  await devtools.send('Accessibility.enable');
  const { nodes } = await devtools.send('Accessibility.getFullAXTree');
  const reviewGroup = nodes.find((node) => node.role?.value === 'menuitem' && node.name?.value === '导入与审核');
  assert.equal(reviewGroup?.description?.value, `${visibleCount} 项待办`);
  const queueReads = result.network.filter((row) => row.path === queuePath);
  assert.ok(queueReads.length > 0 && queueReads.every(({ role, status }) => role === 'reviewer' && status === 200));
  result.checks.reviewQueue = { home: '/master', accessibleName: '导入与审核', describedCount: visibleCount, reads: queueReads.length };
  const { page: admin } = await open('admin', '/', '/settings');
  result.checks.importReviewNavigation = await checkImportReviewNavigation({ admin, buyer, lead, manager, reviewer, origin });
  result.checks.poMasterTemplate = await checkPoMasterTemplate({ page: buyer, origin, out, xlsx });
  result.checks.confirmedArrivalDownload = await checkConfirmedArrivalDownload({ page: buyer, devtools: buyerDevtools, browser, headless, origin, out, warehouse });
  result.checks.factoryLinkBoard = await checkFactoryLinkBoard({ reviewer, openAdmin: async () => (await open('admin', '/master?tab=factory-link')).page, origin, out });
  seedDemoFixture(new URL('../fixtures/demo/frontend-closeout.sql', import.meta.url));
  result.checks.importFactoryDetail = await checkImportFactoryDetail(admin, origin);
  result.checks.frontendCloseout = await checkFrontendCloseout({ page: admin, manager, origin, out });
  result.checks.redReview = await checkRedReview({ page: admin, origin });
  result.checks.crossPageFulfillment = await checkCrossPageFulfillment({ page: admin, origin, buyer: users.buyer, warehouse });
  result.checks.directorHome = await checkDirectorHome({ page: manager, buyer, lead, origin, out, materialPo: componentPo, weekStart: meeting.weekStart, warehouse });
  const { page: peer } = await open('buyerPeer', '/', '/today');
  result.checks.personalWorkspace = await checkPersonalWorkspace({ buyer, peer, origin,
    expectReceiptFailure: (path) => { expectedFailures.push({ role: 'buyer', path, status: 503 }); },
  });
  result.checks.followUpOrderQuery = await checkFollowUpOrderQuery({ page: buyer, origin, out, po: componentPo, materialCode: componentCode, warehouse });
  result.checks.followUpDelivery = await checkFollowUpDelivery({ page: manager, buyer, origin, out, warehouse });
  result.checks.accountLogout = await checkAccountLogout(buyer, origin, (path) => {
    expectedFailures.push({ role: 'buyer', path, status: 503 });
  });
}

async function checkPageStories({ buyer, manager }: { readonly buyer: Page; readonly manager: Page }) {
  await buyer.goto(new URL('/progress?view=development&store=dafuyan', origin).href);
  const progress = buyer.locator('aside');
  const development = await sidebarLink(progress, '计划与新品', '新品开发');
  await development.and(progress.locator('[aria-current="page"]')).waitFor();
  await progress.getByRole('link', { name: '当前进度', exact: true }).press('Enter');
  await buyer.waitForURL(new URL('/progress/current?store=dafuyan', origin).href);
  const main = buyer.getByRole('main');
  const heading = main.getByRole('heading', { name: '当前进度', level: 1, exact: true });
  await heading.waitFor({ state: 'attached' });
  assert.equal(await main.getByRole('tab').count(), 0, '当前进度加载完成后应使用独立页面');
  assert.equal(await heading.evaluate((node) => getComputedStyle(node).clipPath), 'inset(50%)');
  assert.equal(await (await sidebarLink(progress, '计划与新品', '订单与任务排期')).getAttribute('href'), '/progress/schedule?store=dafuyan');

  const batchId = await addStuckSecondBatch(buyer, origin, warehouse);
  const stuckUrl = new URL('/dashboard?view=legacy&preset=custom&from=2025-01-01&to=2025-02-28&lane=finished&card=overdue', origin);
  await manager.goto(stuckUrl.href);
  const stuckTrigger = manager.getByRole('button', { name: '查看卡点明细 HZ09-0001 第 2 批', exact: true });
  await manager.getByRole('button', { name: '查看卡点明细 HZ09-0001 第 1 批', exact: true }).waitFor();
  const stuck = manager.getByRole('dialog', { name: '卡点批次明细', exact: true });
  await openStuckSecondBatch(manager, stuckTrigger, stuck);
  const opened = new URL(stuckUrl);
  opened.searchParams.set('stuckBatch', batchId);
  assert.equal(manager.url(), opened.href);
  await manager.reload();
  await stuck.getByText('第 2 批', { exact: true }).waitFor();
  const sharedOrder = await checkStuckRoundTrip(manager, stuck, batchId, false);
  await checkStuckRoundTrip(manager, stuck, batchId, true);
  await manager.keyboard.press('Escape');
  await stuck.waitFor({ state: 'hidden' });
  await manager.waitForURL(stuckUrl.href);
  await stuckTrigger.and(manager.locator(':focus')).waitFor();

  await buyer.goto(sharedOrder.href);
  await buyer.getByRole('heading', { name: 'HZ09-0001', exact: true }).waitFor();
  assert.equal(await buyer.getByRole('link', { name: '返回管理看板', exact: true }).count(), 0);
  await buyer.goto(opened.href);
  await buyer.getByRole('heading', { name: '这个角色看不到这页。', exact: true }).waitFor();

  const sidebar = manager.locator('aside');
  const suppliers = await sidebarLink(sidebar, '管理看板', '供应商表现');
  await suppliers.click();
  assert.equal(new URL(manager.url()).searchParams.get('from'), '2025-01-01');
  assert.equal(new URL(manager.url()).searchParams.get('lane'), 'finished');
  const supplier = manager.getByRole('button', { name: '合成催货甲厂', exact: true });
  await supplier.click();
  const supplierDetails = manager.getByRole('dialog', { name: '合成催货甲厂 · 2025-01-01 至 2025-02-28', exact: true });
  await supplierDetails.getByRole('columnheader', { name: '最后实收日', exact: true }).waitFor();
  assert.equal(new URL(manager.url()).searchParams.get('view'), 'suppliers');
  await manager.keyboard.press('Escape');
  await supplierDetails.waitFor({ state: 'hidden' });
  await (await sidebarLink(sidebar, '管理看板', '采购负荷')).click();
  await manager.getByRole('heading', { name: '采购负荷', level: 1, exact: true }).waitFor();
  const risk = await sidebarLink(sidebar, '管理看板', '排期任务进度');
  await risk.click();
  await manager.getByRole('heading', { name: '排期任务进度', level: 1, exact: true }).waitFor();
  await risk.and(sidebar.locator('[aria-current="page"]')).waitFor();
  assertDashboardPeriod(manager, stuckUrl);
  await (await sidebarLink(sidebar, '管理看板', '采购负荷')).click();
  await manager.getByRole('heading', { name: '采购负荷', level: 1, exact: true }).waitFor();
  assertDashboardPeriod(manager, stuckUrl);
  await manager.setViewportSize({ width: 320, height: 780 });
  await manager.goto(stuckUrl.href);
  const firstStuck = manager.getByRole('button', { name: /^查看卡点明细/u }).first();
  await firstStuck.waitFor();
  const firstBatch = await firstStuck.boundingBox();
  assert.ok(firstBatch && firstBatch.y >= 0 && firstBatch.y + firstBatch.height <= 780, '手机首屏应能查看第一批卡点');
  assert.equal(await manager.getByRole('radiogroup', { name: '期间', exact: true }).count(), 0);
  await openStuckSecondBatch(manager, stuckTrigger, stuck);
  await checkStuckRoundTrip(manager, stuck, batchId, false);
  await manager.keyboard.press('Escape');
  await stuck.waitFor({ state: 'hidden' });
  await manager.waitForURL(stuckUrl.href);
  await stuckTrigger.and(manager.locator(':focus')).waitFor();
  await manager.setViewportSize({ width: 1440, height: 900 });
  await openStuckSecondBatch(manager, stuckTrigger, stuck);
  const batchLink = stuck.getByRole('link', { name: '核对本批记录', exact: true });
  await batchLink.press('Enter');
  await manager.waitForURL(sharedOrder.href);
  const removed = await buyer.request.delete(new URL(`/api/v1/batches/${batchId}`, origin).href);
  assert.equal(removed.status(), 204, '清理看板新增的合成批次');
  await manager.getByRole('link', { name: '返回管理看板', exact: true }).press('Enter');
  await manager.waitForURL(opened.href);
  const list = manager.getByRole('region', { name: '卡点明细', exact: true });
  await list.getByText('原批次已不在当前卡点清单，原筛选已保留。', { exact: true }).waitFor();
  await list.and(manager.locator(':focus')).waitFor();
  return { legacyDevelopment: true, scope: 'dafuyan', hiddenPageBanner: true, localDetails: ['卡点', '供应商表现'], focusedStuckBatch: true, phoneWidth: 320 };
}

function assertDashboardPeriod(page: Page, expected: URL): void {
  const current = new URL(page.url());
  for (const key of ['preset', 'from', 'to', 'lane']) assert.equal(current.searchParams.get(key), expected.searchParams.get(key));
}

function unexpectedResponses(network: readonly ResponseRecord[]): ResponseRecord[] {
  const signedOutSessionReads = new Set<number>();
  const pending = [...expectedFailures];
  const unexpected = network.filter((response) => {
    if (response.path === logoutPath && response.status === 204) signedOutSessionReads.delete(response.session);
    if (response.status < 400) return false;
    if (response.signedIn) {
      const match = pending.findIndex((expected) => expected.role === response.role && expected.path === response.path && expected.status === response.status);
      if (match === -1) return true;
      pending.splice(match, 1);
      return false;
    }
    if (response.path === todayPath && response.status === 401 && response.startedWithSession === true) return false;
    if (response.path !== '/api/v1/me' || response.status !== 401 || signedOutSessionReads.has(response.session)) return true;
    signedOutSessionReads.add(response.session);
    return false;
  });
  assert.deepEqual(pending, [], '确认浏览器观测到了刻意触发的失败响应');
  return unexpected;
}

async function open(role: Role, path: string, landing = path) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const devtools = await context.newCDPSession(page);
  let signedIn = false;
  const session = ++nextSession;
  const signedInTodayReads = new Set<string>();
  devtools.on('Network.requestWillBeSent', ({ requestId, request }) => {
    const url = new URL(request.url);
    if (signedIn && url.origin === origin.origin && url.pathname === todayPath && request.method === 'GET') signedInTodayReads.add(requestId);
  });
  devtools.on('Network.loadingFailed', ({ requestId }) => { signedInTodayReads.delete(requestId); });
  devtools.on('Network.responseReceived', ({ requestId, response }) => {
    const url = new URL(response.url);
    if (url.origin !== origin.origin) return;
    if (url.pathname === loginPath && response.status === 200) signedIn = true;
    if (url.pathname === logoutPath && response.status === 204) signedIn = false;
    const startedWithSession = signedInTodayReads.delete(requestId);
    result.network.push({ role, session, path: url.pathname, status: response.status, signedIn,
      ...(startedWithSession ? { startedWithSession } : {}) });
  });
  devtools.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    result.exceptions.push({ role, text: exceptionDetails.text });
  });
  await devtools.send('Network.enable');
  await devtools.send('Runtime.enable');
  await page.goto(new URL(path, origin).href);
  const submit = page.getByRole('button', { name: '登录', exact: true });
  await submit.waitFor();
  assert.equal(await submit.getAttribute('type'), 'submit');
  await page.getByLabel('用户').fill(users[role]);
  await page.getByLabel('访问码').fill(accessCode);
  const loggedIn = page.waitForResponse((response) =>
    new URL(response.url()).pathname === loginPath && response.request().method() === 'POST');
  const loadedEntry = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === origin.origin && /^\/assets\/index-[\w-]+\.js$/.test(url.pathname)
      && response.request().resourceType() === 'script';
  }).then(async (response) => {
    assert.ok(response.ok());
    return { asset: new URL(response.url()).pathname, sha256: createHash('sha256').update(await response.body()).digest('hex') };
  });
  const reviewQueue = role === 'reviewer' ? page.waitForResponse((response) => new URL(response.url()).pathname === queuePath) : undefined;
  const [login, entry, queue] = await Promise.all([loggedIn, loadedEntry, reviewQueue, page.getByLabel('访问码').press('Enter')]);
  assert.equal(login.status(), 200);
  await page.waitForURL(new URL(landing, origin).href);
  if (queue) assert.equal(queue.status(), 200);
  return { page, entry, devtools };
}

async function checkManagementNavigation({ manager, lead, buyer, reviewer, reportPath }: {
  readonly manager: Page;
  readonly lead: Page;
  readonly buyer: Page;
  readonly reviewer: Page;
  readonly reportPath: string;
}) {
  await manager.goto(new URL(reportPath, origin).href);
  const sidebar = manager.locator('aside');
  const current = sidebar.locator('[aria-current="page"]');
  const bottlenecks = await sidebarLink(sidebar, '管理看板', '卡点');
  await bottlenecks.click();
  await manager.waitForURL(new URL('/dashboard', origin).href);
  await bottlenecks.and(current).waitFor();
  const weekly = sidebar.getByRole('link', { name: '周报（待开发）', exact: true });
  await weekly.click();
  await manager.waitForURL(new URL('/reports', origin).href);
  await weekly.and(current).waitFor();
  assert.equal(await manager.getByRole('main').getByRole('tab').count(), 0);
  await manager.getByRole('button', { name: '生成全店周报', exact: true }).waitFor();

  await lead.locator(`a[href="${reportPath}"]`).waitFor();
  assert.equal(await lead.getByRole('button', { name: '生成全店周报', exact: true }).count(), 0);
  await lead.goto(new URL(reportPath, origin).href);
  const download = lead.waitForEvent('download');
  await lead.getByRole('button', { name: '导出 Excel', exact: true }).click();
  assert.match((await download).suggestedFilename(), /\.xlsx$/);
  await lead.setViewportSize({ width: 320, height: 780 });
  await lead.getByRole('button', { name: '打开菜单', exact: true }).click();
  const menu = lead.getByRole('dialog', { name: '导航', exact: true });
  const phoneReport = menu.getByRole('link', { name: '周报（待开发）', exact: true }).and(menu.locator('[aria-current="page"]'));
  await phoneReport.waitFor();
  await lead.goto(new URL(reportPath + '/print', origin).href);
  await lead.getByRole('heading', { name: '管理周会 · 达肤妍', exact: true }).waitFor();
  assert.equal(await lead.getByRole('navigation', { name: '管理视图' }).count(), 0);

  const forbidden = { name: '这个角色看不到这页。', exact: true };
  await buyer.goto(new URL(reportPath + '/print', origin).href);
  await buyer.getByRole('heading', forbidden).waitFor();
  await reviewer.goto(new URL(reportPath, origin).href);
  await reviewer.getByRole('heading', forbidden).waitFor();
  await reviewer.goto(new URL('/progress', origin).href);
  return { manager: ['/dashboard', '/reports', reportPath], leadHome: '/reports', phoneWidth: 320, deniedRoles: ['buyer', 'reviewer'] };
}

async function checkShell(page: Page, entry: { readonly asset: string; readonly sha256: string }) {
  const header = page.getByRole('banner');
  await header.getByRole('navigation', { name: '当前位置' }).getByText('个人工作台', { exact: true }).and(page.locator('[aria-current="page"]')).waitFor();
  assert.equal(await header.getByText('开发登录', { exact: true }).count(), 0);
  const search = page.getByRole('button', { name: searchLabel });
  const mac = process.platform === 'darwin';
  const label = mac ? '⌘K' : 'Ctrl+K';
  assert.ok((await search.textContent())?.includes(label));
  assert.equal(await search.getAttribute('aria-keyshortcuts'), mac ? 'Meta+K' : 'Control+K');
  await page.keyboard.press(mac ? 'Meta+k' : 'Control+k');
  await page.getByRole('dialog', { name: '搜索' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '搜索' }).waitFor({ state: 'hidden' });

  const icon = await page.locator('link[rel="icon"]').getAttribute('href');
  assert.equal(icon, '/favicon.png');
  const iconResponse = await page.request.get(new URL(icon, origin).href);
  assert.equal(iconResponse.status(), 200);
  assert.match(iconResponse.headers()['content-type'] ?? '', /^image\/png/);
  const asset = await page.locator('script[type="module"][src]').getAttribute('src');
  assert.match(asset ?? '', /^\/assets\/[^/]+\.js$/);
  assert.equal(entry.asset, asset);
  result.checks.shell = { shortcut: label, favicon: icon, ...entry };
}

async function checkMobileOrders(page: Page) {
  const po = 'PO' + Date.now();
  const rows = [
    { nameRaw: '验收同单甲款温和洁面净润规格一百毫升', itemCodeRaw: 'PREACCEPT-A1', duplicate: true },
    { nameRaw: '验收同单甲款温和洁面净润规格一百毫升', itemCodeRaw: 'PREACCEPT-A1', duplicate: true },
    { nameRaw: '验收同单乙款温和洁面净润规格一百毫升', itemCodeRaw: 'PREACCEPT-B2', duplicate: false },
  ];
  const orderRows = [];
  for (const line of rows) {
    const response = await page.request.post(new URL('/api/v1/lines', origin).href, {
      data: { nameRaw: line.nameRaw, itemCodeRaw: line.itemCodeRaw, poRaw: po, lane: 'finished', qtyOrdered: 90_000, unit: '件', receiverPartyId: warehouse, buyerUserId: users.buyer },
    });
    assert.ok(response.ok(), '建立同 PO 夹具 HTTP ' + response.status());
    const body = await response.json();
    assert.ok(typeof body.line?.id === 'string' && body.line.id.length > 0);
    orderRows.push({ ...line, id: body.line.id });
  }
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(new URL('/lines?lane=finished&q=' + po, origin).href);
  const checks = [];
  for (const line of orderRows) {
    const detail = page.locator('a[href="/lines/' + encodeURIComponent(line.id) + '"]');
    const row = page.getByRole('row').filter({ has: detail });
    await row.waitFor();
    const fields = [
      row.getByRole('link', { name: po, exact: true }),
      row.getByText(line.nameRaw, { exact: true }),
      row.getByText('商品编码 ' + line.itemCodeRaw, { exact: true }),
    ];
    if (line.duplicate) {
      fields.push(row.getByText('订单行 ' + line.id, { exact: true }));
      const checkbox = row.getByRole('checkbox', { name: new RegExp(line.id) });
      await checkbox.check();
      assert.ok(await checkbox.isChecked());
      await checkbox.uncheck();
    }
    for (const field of fields) assert.ok(await fits(field), '320 像素下识别订单的字段必须完整在单元格内');
    checks.push({ po, code: line.itemCodeRaw, distinguishedByLineId: line.duplicate });
  }
  assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
  await page.screenshot({ path: join(out, 'mobile-orders.png'), animations: 'disabled' });
  result.checks.mobile = checks;

  const queryBeforePreview = new URL(page.url()).search;
  await page.getByRole('button', { name: '预览', exact: true }).first().click();
  const preview = page.getByRole('dialog', { name: po + ' 预览', exact: true });
  await preview.getByText('订单行摘要', { exact: true }).waitFor();
  const amount = preview.getByText('90,000', { exact: true }).first();
  const amounts: { viewport: number; lines: number }[] = [];
  for (const viewport of [320, 390]) {
    await page.setViewportSize({ width: viewport, height: 780 });
    await page.screenshot({ path: join(out, 'mobile-order-preview-' + viewport + '.png'), animations: 'disabled' });
    assert.ok(await fits(amount), '手机预览里的数量需要完整可见');
    const lines = await amount.evaluate((element: BrowserElement) => {
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.y))).size;
    });
    assert.equal(lines, 1, viewport + ' 像素下数量必须一行可读');
    amounts.push({ viewport, lines });
  }
  await page.keyboard.press('Escape');
  await preview.waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).search, queryBeforePreview);
  result.checks.orderPreview = { amounts, filterPreserved: true };
}

async function checkLineColumns(page: Page) {
  const address = new URL(page.url());
  address.searchParams.set('hide', 'stage');
  await page.goto(address.href);
  const phaseHeader = page.getByRole('columnheader', { name: '阶段', exact: true }).first();
  const dueHeader = page.getByRole('columnheader', { name: '到货', exact: true });
  const display = page.getByRole('button', { name: /^显\s*示$/ });
  const columns = page.getByRole('button', { name: '列', exact: true });
  const exportLink = page.getByRole('link', { name: '导出 Excel', exact: true });
  const mobile = [];
  for (const width of [320, 340, 341, 390, 767]) {
    await page.setViewportSize({ width, height: 720 });
    await phaseHeader.waitFor();
    await dueHeader.waitFor({ state: width > 340 ? 'visible' : 'hidden' });
    assert.equal(await columns.isVisible(), false);
    await display.click();
    const menu = page.locator('.ant-popover').filter({ has: exportLink });
    await menu.getByText('舒适', { exact: true }).waitFor();
    assert.equal(await menu.getByRole('checkbox').count(), 0, `${width} 像素手机显示菜单使用固定列`);
    const headers = await downloadLineHeaders(page, exportLink);
    assert.deepEqual(headers, width > 340
      ? ['采购单号', '品名', '阶段', '下一到货', '卡了几天']
      : ['采购单号', '品名', '阶段', '卡了几天']);
    mobile.push({ width, headers });
    await display.click();
  }

  await page.setViewportSize({ width: 768, height: 720 });
  await columns.click();
  const menu = page.locator('.ant-popover:not(.ant-popover-hidden)');
  const phase = menu.getByRole('checkbox', { name: '阶段', exact: true });
  const phaseLabel = menu.getByText('阶段', { exact: true });
  await phase.waitFor();
  assert.equal(await display.isVisible(), false);
  assert.equal(await phase.isChecked(), false);
  await phaseHeader.waitFor({ state: 'hidden' });
  await phaseLabel.click();
  await page.waitForURL((url) => !url.searchParams.has('hide'));
  await phaseHeader.waitFor();
  assert.equal(await phase.isChecked(), true);
  const shown = await downloadLineHeaders(page, exportLink);
  assert.ok(shown.includes('阶段'));
  await phase.waitFor({ state: 'hidden' });
  await columns.click();
  await phaseLabel.click();
  await page.waitForURL((url) => url.searchParams.get('hide') === 'stage');
  await phaseHeader.waitFor({ state: 'hidden' });
  assert.equal(await phase.isChecked(), false);
  const hidden = await downloadLineHeaders(page, exportLink);
  assert.deepEqual(hidden, shown.filter((header) => header !== '阶段'));
  assert.ok(hidden.includes('采购单号'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await phaseHeader.waitFor({ state: 'hidden' });
  assert.deepEqual(await downloadLineHeaders(page, exportLink), hidden);
  result.checks.lineColumns = { mobile, desktop: { widths: [768, 1440], hidden, shown } };
}

async function downloadLineHeaders(page: Page, link: Locator): Promise<string[]> {
  const pending = page.waitForEvent('download');
  await link.click();
  const download = await pending;
  const book = xlsx.read(await readFile(await download.path()));
  const sheet = book.Sheets['订单行'];
  assert.ok(sheet);
  const [headers, firstRow] = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  assert.ok(headers && firstRow);
  assert.equal(firstRow[0], new URL(page.url()).searchParams.get('q'));
  return headers;
}

async function checkNavigation(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL('/progress', origin).href);
  await page.locator('aside').getByRole('link', { name: '跟进中心', exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 780 });
  const toggle = page.getByRole('button', { name: '打开菜单', exact: true });
  await toggle.waitFor();
  const target = await toggle.boundingBox();
  assert.ok(target && target.width >= 44 && target.height >= 44);
  await toggle.press('Enter');
  const navigation = page.getByRole('dialog', { name: '导航', exact: true });
  const link = navigation.getByRole('link', { name: '跟进中心', exact: true });
  await link.waitFor();
  const item = await navigation.getByRole('menuitem', { name: '跟进中心', exact: true }).boundingBox();
  assert.ok(item && item.width >= 44 && item.height >= 44);
  await page.screenshot({ path: join(out, 'mobile-navigation.png'), animations: 'disabled' });
  const hasFocus = () => link.evaluate((node: BrowserElement) => node.ownerDocument.activeElement === node);
  for (let step = 0; step < 24 && !await hasFocus(); step++) await page.keyboard.press('Tab');
  assert.ok(await hasFocus(), 'Tab 可聚焦手机菜单中的跟进中心');
  await page.keyboard.press('Enter');
  await page.waitForURL(new URL('/lines', origin).href);
  await page.getByRole('heading', { name: '跟进中心', exact: true }).waitFor();
  await navigation.waitFor({ state: 'hidden' });
  result.checks.navigation = { accessibleName: '跟进中心', touch: [target.width, target.height], itemTouch: [item.width, item.height], keyboardNavigated: true };
}

async function checkPartyOrderNavigation(page: Page) {
  const partyId = 'hz09-factory-b';
  const partyName = '合成催货乙厂';
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL('/parties/' + partyId, origin).href);
  await page.getByRole('heading', { name: '主体 ' + partyName, exact: true }).waitFor();
  await page.getByRole('heading', { name: '别名', exact: true }).waitFor();
  await page.getByRole('heading', { name: '指标', exact: true }).waitFor();
  await page.getByText(/近一个月/).waitFor();
  assert.equal(await page.getByRole('main').getByRole('tab').count(), 0);

  await page.getByRole('link', { name: '查看供应商订单', exact: true }).press('Enter');
  await page.waitForURL((url) => url.pathname === '/lines'
    && url.searchParams.get('lane') === 'all' && url.searchParams.get('supplierPartyId') === partyId);
  await page.getByRole('link', { name: 'HZ09-0250', exact: true }).waitFor();

  await page.goBack();
  await page.setViewportSize({ width: 320, height: 780 });
  await page.getByRole('link', { name: '查看代工厂相关订单', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/lines'
    && url.searchParams.get('lane') === 'all' && url.searchParams.get('factoryPartyId') === partyId);
  await page.getByRole('heading', { name: '跟进中心', exact: true }).waitFor();
  await page.getByRole('link', { name: 'HZ09-0251', exact: true }).waitFor();
  const factoryOrders = await page.getByRole('link', { name: /^HZ09-\d{4}$/ }).allTextContents();
  assert.deepEqual(factoryOrders, ['HZ09-0251']);
  await page.setViewportSize({ width: 1440, height: 900 });
  return { supplierPartyId: partyId, supplierOrder: 'HZ09-0250', factoryPartyId: partyId, factoryOrders, phoneWidth: 320 };
}

async function checkImportRecovery(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL('/imports', origin).href);
  const path = '/api/v1/imports/detect';
  const input = page.locator('input[type="file"]');
  const goodWorkbook = await readFile(workbook);
  const malformed = [
    { name: '误标为工作簿.xlsx', buffer: Buffer.from('not an Excel workbook') },
    { name: '截断工作簿.xlsx', buffer: goodWorkbook.subarray(0, goodWorkbook.length - 22) },
  ];
  const detect = (response: { url(): string; request(): { method(): string } }) =>
    new URL(response.url()).pathname === path && response.request().method() === 'POST';
  for (const file of malformed) {
    const [response] = await Promise.all([
      page.waitForResponse(detect),
      input.setInputFiles({ ...file, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    ]);
    assert.equal(response.status(), 400, '不可读取的工作簿应返回文件校验错误');
    expectedFailures.push({ role: 'buyer', path, status: 400 });
    const alert = page.getByRole('alert').filter({ hasText: '无法解析文件' });
    await alert.waitFor();
    assert.match(await alert.innerText(), /更换文件.*重新导出/);
    assert.ok(await page.getByRole('button', { name: '开始解析', exact: true }).isDisabled());
  }
  await page.screenshot({ path: join(out, 'import-recovery.png'), animations: 'disabled' });
  const [recovered] = await Promise.all([
    page.waitForResponse(detect),
    input.setInputFiles(fileURLToPath(workbook)),
  ]);
  assert.ok(recovered.ok());
  await page.getByRole('combobox', { name: '导入类型', exact: true }).click();
  await page.getByRole('listbox').getByRole('option', { name: /^采购订单总表/ }).click();
  assert.ok(await page.getByRole('button', { name: '开始解析', exact: true }).isEnabled());
  await page.getByRole('alert').filter({ hasText: '无法解析文件' }).waitFor({ state: 'hidden' });
  result.checks.importRecovery = { rejectedWorkbooks: malformed.length, replacedWithValidWorkbook: true };
}

async function checkProcurementImport(page: Page): Promise<string> {
  await page.getByRole('button', { name: '开始解析', exact: true }).click();
  await page.waitForURL(/\/imports\/[^/]+$/);
  const importPath = new URL(page.url()).pathname;
  await page.getByText('采购事项关联预览', { exact: true }).waitFor();
  const finished = page.getByRole('table', { name: '总表成品明细' });
  await finished.getByText('采购订单总表 第 2 行', { exact: true }).waitFor();
  const component = page.getByRole('table', { name: '采购子件明细' }).getByRole('row').filter({ hasText: componentCode });
  await component.getByText(componentPo, { exact: true }).waitFor();
  assert.equal(await component.getByText('共用子件', { exact: true }).count(), 2);
  await page.screenshot({ path: join(out, 'procurement-preview.png'), animations: 'disabled' });

  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await page.getByText(/已提交 · 共 \d+ 行/).waitFor();
  result.checks.importOrderScope = await checkImportOrderScope(page, importPath);
  await page.goto(new URL(importPath, origin).href);
  await page.reload();
  await page.getByText('采购事项关联', { exact: true }).waitFor();
  await component.getByRole('link', { name: '打开采购事项', exact: true }).click();
  const source = page.getByRole('region', { name: '采购事项来源' });
  await source.getByRole('heading', { name: '关联成品', exact: true }).waitFor();
  assert.equal(await source.locator('a[href^="/lines/"]').count(), 3);
  await source.getByRole('button', { name: '来源版本（1）', exact: true }).click();
  const sourceLink = source.getByRole('link', { name: /第 5 行$/ });
  assert.equal(await sourceLink.getAttribute('href'), importPath);
  await source.getByText(workbookName, { exact: false }).waitFor();
  const componentPath = new URL(page.url()).pathname;
  const memo = '合成验收跟进记录';
  const note = page.getByRole('region', { name: '订单行备注', exact: true });
  await note.getByRole('textbox', { name: '订单行备注', exact: true }).fill(memo);
  await note.getByRole('button', { name: '保存备注', exact: true }).click();
  await note.getByText(memo, { exact: true }).waitFor();
  await page.reload();
  await note.getByText(memo, { exact: true }).waitFor();
  await page.screenshot({ path: join(out, 'procurement-component.png'), animations: 'disabled' });

  await page.goto(new URL('/imports?template=po-master-v1&status=committed', origin).href);
  await page.getByRole('link', { name: workbookName, exact: true }).click();
  await page.waitForURL(`**${importPath}?template=po-master-v1&status=committed`);
  result.checks.procurementImport = { workbookName, importPath, componentPath, componentCode, componentPo, linkedFinished: 3, followUp: memo };
  return importPath;
}

async function checkImportOrderScope(page: Page, importPath: string) {
  const main = page.getByRole('main');
  await main.getByText(/\d+ 个新主体待审核/u).waitFor();
  assert.equal(await main.getByRole('link', { name: /去审核/u }).count(), 0);
  assert.equal(await main.getByRole('link', { name: '按总表首批生成待确认批次', exact: true }).count(), 0);
  const orderLink = main.getByRole('link', { name: '查看本次导入订单', exact: true });
  assert.equal(await orderLink.count(), 1);

  const importBatchId = decodeURIComponent(importPath.slice('/imports/'.length));
  const matchesScope = (url: URL) => url.searchParams.get('importBatchId') === importBatchId;
  const batchCountBefore = readDeliveryBatchCount();
  const [list] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/lines'),
    orderLink.click(),
  ]);
  await page.waitForURL((url) => url.pathname === '/lines' && url.searchParams.get('lane') === 'all' && matchesScope(url));
  const summary = await openOrderSummary(page);
  for (const response of [list, summary]) {
    assert.ok(response.ok() && matchesScope(new URL(response.url())));
    assert.equal(response.request().method(), 'GET');
  }
  const { total } = await summary.json();
  assert.equal(total, 8);
  await page.getByRole('link', { name: 'PO20261117009001', exact: true }).waitFor();
  await page.getByRole('link', { name: componentPo, exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'HZ09-0501', exact: true }).count(), 0);
  const batchCountAfter = readDeliveryBatchCount();
  assert.equal(batchCountAfter, batchCountBefore);

  const exportLink = page.getByRole('link', { name: '导出 Excel', exact: true });
  const exportUrl = new URL(await exportLink.getAttribute('href') ?? '', origin);
  assert.ok(matchesScope(exportUrl));
  const [download] = await Promise.all([page.waitForEvent('download'), exportLink.click()]);
  const path = join(out, 'procurement-import-lines.xlsx');
  await download.saveAs(path);
  const book = xlsx.read(await readFile(path));
  const rows = xlsx.utils.sheet_to_json<string[]>(book.Sheets['订单行'], { header: 1 }).slice(1);
  assert.equal(rows.length, total);
  assert.ok(rows.some((row) => row[0] === componentPo));
  assert.ok(rows.every((row) => row[0] !== 'HZ09-0501'));
  await checkImportedNoBatchView(page, matchesScope);
  return { importBatchId, total, batchCountBefore, batchCountAfter, exported: rows.length, noBatchViewKeepsScope: true };
}

async function openOrderSummary(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse((item) => new URL(item.url()).pathname === '/api/v1/lines/summary'),
    page.getByRole('button', { name: '筛选结果概览', exact: true, expanded: false }).click(),
  ]);
  await page.getByRole('group', { name: '跟进中心筛选结果指标', exact: true }).waitFor();
  return response;
}

async function checkImportedNoBatchView(page: Page, matchesScope: (url: URL) => boolean) {
  const noBatch = page.getByRole('radiogroup', { name: '常用视图' }).getByText('未建要货', { exact: true });
  const [list] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/lines'),
    noBatch.click(),
  ]);
  await page.waitForURL((url) => url.searchParams.get('view') === 'no-batch' && matchesScope(url));
  const summary = await openOrderSummary(page);
  for (const response of [list, summary]) assert.ok(response.ok() && matchesScope(new URL(response.url())));
  const exportLink = page.getByRole('link', { name: '导出 Excel', exact: true });
  assert.ok(matchesScope(new URL(await exportLink.getAttribute('href') ?? '', origin)));
  await page.getByRole('button', { name: '退出视图', exact: true }).click();
  await page.waitForURL((url) => !url.searchParams.has('view') && matchesScope(url));
  await page.getByRole('button', { name: '退出本次导入范围', exact: true }).click();
  await page.waitForURL((url) => !url.searchParams.has('importBatchId'));
}

async function checkImportReviewLink(page: Page, importPath: string): Promise<void> {
  await page.goto(new URL(importPath, origin).href);
  const link = page.getByRole('main').getByRole('link', { name: /^去审核 \d+ 个新主体$/u });
  const [queue] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/master/aliases'),
    link.click(),
  ]);
  assert.ok(queue.ok());
  await page.waitForURL((url) => url.pathname === '/master');
  result.checks.importReviewLink = { target: '/master', aliasesStatus: queue.status() };
}

function readDeliveryBatchCount(): number {
  const { DATABASE_URL: database, PGBIN: pgBin } = process.env;
  assert.ok(database && /^postgresql:\/\/sw_accept@127\.0\.0\.1:\d+\/sw_accept_[0-9a-f]+$/u.test(database));
  const executable = process.platform === 'win32' ? 'psql.exe' : 'psql';
  const output = execFileSync(pgBin === undefined ? executable : join(pgBin, executable), [
    database, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', 'select count(*) from delivery_batches',
  ], { encoding: 'utf8' }).trim();
  assert.match(output, /^\d+$/u);
  return Number(output);
}

async function fits(field: Locator) {
  await field.waitFor();
  return field.evaluate((node: BrowserElement) => {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    const cell = node.closest('th, td');
    if (cell === null) return false;
    const bounds = cell.getBoundingClientRect();
    let top = bounds.top;
    let bottom = bounds.bottom;
    let left = Math.max(0, bounds.left);
    let right = Math.min(node.ownerDocument.documentElement.clientWidth, bounds.right);
    for (let element: BrowserElement | null = node; element !== null && element !== cell; element = element.parentElement) {
      const style = globalThis.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.overflowX !== 'visible') {
        left = Math.max(left, rect.left);
        right = Math.min(right, rect.right);
      }
      if (style.overflowY !== 'visible') {
        top = Math.max(top, rect.top);
        bottom = Math.min(bottom, rect.bottom);
      }
    }
    const rects = [...range.getClientRects()];
    return rects.length > 0 && rects.every((rect) => rect.left >= left - 1 && rect.right <= right + 1
      && rect.top >= top - 1 && rect.bottom <= bottom + 1);
  });
}
