import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { checkFirstBatch } from './procurement-today-acceptance.ts';

const workbook = new URL('../fixtures/synthetic/po-master-procurement.xlsx', import.meta.url);
const workbookName = 'po-master-procurement.xlsx';
const componentCode = '99010003';
const componentPo = 'PO20261117009103';

const requireWeb = createRequire(new URL('../packages/report-renderers/package.json', import.meta.url));
const { chromium }: typeof import('../node_modules/.pnpm/node_modules/playwright/index.js') = requireWeb('playwright');
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
  buyer: '0199f0a0-0000-7000-8000-000000000002',
  reviewer: '0199f0a0-0000-7000-8000-000000000004',
  manager: '0199f0a0-0000-7000-8000-000000000005',
};
const warehouse = '0199f0a0-0000-7000-8000-000000000010';
const queuePath = '/api/v1/master/review-queue/counts';
const loginPath = '/api/v1/auth/dev/login';
const searchLabel = '搜索单号、品名、供应商';
const browser = await chromium.launch({ headless: true, channel });
type Role = keyof typeof users;
type BrowserElement = Element;
type ResponseRecord = { readonly role: Role; readonly session: number; readonly path: string; readonly status: number; readonly signedIn: boolean };
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
};
const result: AcceptanceResult = { platform: process.platform, browser: browser.version(), channel, checks: {}, network: [], exceptions: [] };
const expectedFailures: ExpectedFailure[] = [];
let nextSession = 0;
await mkdir(out, { recursive: true });

try {
  await procurementAcceptance();
  const errors = unexpectedResponses(result.network);
  assert.deepEqual(errors, []);
  assert.deepEqual(result.exceptions, []);
  result.result = 'pass';
} catch (error) {
  result.result = 'fail';
  result.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({ platform: result.platform, checks: Object.keys(result.checks), result: result.result, failure: result.failure }));

async function procurementAcceptance(): Promise<void> {
  const { page: buyer, entry } = await open('buyer', '/', '/today');
  await checkShell(buyer, entry);
  await buyer.getByRole('heading', { name: '今日', exact: true }).waitFor();
  await checkImportRecovery(buyer);
  await checkProcurementImport(buyer);
  await checkMobileOrders(buyer);
  await checkNavigation(buyer);
  result.checks.firstBatch = await checkFirstBatch({ page: buyer, origin, buyer: users.buyer, warehouse });

  const deep = '/lines?lane=material&q=' + componentPo + '#batch';
  const { page: deepBuyer } = await open('buyer', deep);
  await deepBuyer.getByRole('heading', { name: '跟进台', exact: true }).waitFor();
  await deepBuyer.getByRole('link', { name: componentPo, exact: true }).waitFor();
  await buyer.goto(new URL('/reports', origin).href);
  await buyer.getByRole('heading', { name: '这个角色看不到这页。', exact: true }).waitFor();
  const { page: manager } = await open('manager', '/', '/dashboard');
  await manager.getByRole('heading', { name: '管理看板', exact: true }).waitFor();
  result.checks.procurementHome = { buyer: '/today', manager: '/dashboard', restoredDeepLink: deep, forbiddenReports: true };

  const { page: reviewer, devtools } = await open('reviewer', '/progress');
  const badge = reviewer.locator('aside').getByRole('link', { name: '主数据', exact: true }).locator('.ant-badge');
  await badge.waitFor();
  const visibleCount = (await badge.innerText()).trim();
  assert.match(visibleCount, /^[1-9]\d*\+?$/);
  await devtools.send('Accessibility.enable');
  const { nodes } = await devtools.send('Accessibility.getFullAXTree');
  const reviewLink = nodes.find((node) => node.role?.value === 'link' && node.name?.value === '主数据');
  assert.equal(reviewLink?.description?.value, visibleCount);
  const queueReads = result.network.filter((row) => row.path === queuePath);
  assert.ok(queueReads.length > 0 && queueReads.every(({ role, status }) => role === 'reviewer' && status === 200));
  result.checks.reviewQueue = { accessibleName: '主数据', describedCount: visibleCount, reads: queueReads.length };
}

function unexpectedResponses(network: readonly ResponseRecord[]): ResponseRecord[] {
  const initialSessionReads = new Set<number>();
  const pending = [...expectedFailures];
  const unexpected = network.filter((response) => {
    if (response.status < 400) return false;
    if (response.signedIn) {
      const match = pending.findIndex((expected) => expected.role === response.role && expected.path === response.path && expected.status === response.status);
      if (match === -1) return true;
      pending.splice(match, 1);
      return false;
    }
    if (response.path !== '/api/v1/me' || response.status !== 401 || initialSessionReads.has(response.session)) return true;
    initialSessionReads.add(response.session);
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
  devtools.on('Network.responseReceived', ({ response }) => {
    const url = new URL(response.url);
    if (url.origin !== origin.origin) return;
    if (url.pathname === loginPath && response.status === 200) signedIn = true;
    result.network.push({ role, session, path: url.pathname, status: response.status, signedIn });
  });
  devtools.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    result.exceptions.push({ role, text: exceptionDetails.text });
  });
  await devtools.send('Network.enable');
  await devtools.send('Runtime.enable');
  await page.goto(new URL(path, origin).href);
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

async function checkShell(page: Page, entry: { readonly asset: string; readonly sha256: string }) {
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

async function checkNavigation(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL('/progress', origin).href);
  await page.locator('aside').getByRole('link', { name: '跟进台', exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 780 });
  const toggle = page.getByRole('button', { name: '打开菜单', exact: true });
  await toggle.waitFor();
  const target = await toggle.boundingBox();
  assert.ok(target && target.width >= 44 && target.height >= 44);
  await toggle.press('Enter');
  const navigation = page.getByRole('dialog', { name: '导航', exact: true });
  const link = navigation.getByRole('link', { name: '跟进台', exact: true });
  await link.waitFor();
  const item = await navigation.getByRole('menuitem', { name: '跟进台', exact: true }).boundingBox();
  assert.ok(item && item.width >= 44 && item.height >= 44);
  await page.screenshot({ path: join(out, 'mobile-navigation.png'), animations: 'disabled' });
  const hasFocus = () => link.evaluate((node: BrowserElement) => node.ownerDocument.activeElement === node);
  for (let step = 0; step < 24 && !await hasFocus(); step++) await page.keyboard.press('Tab');
  assert.ok(await hasFocus(), 'Tab 可聚焦手机菜单中的跟进台');
  await page.keyboard.press('Enter');
  await page.waitForURL(new URL('/lines', origin).href);
  await page.getByRole('heading', { name: '跟进台', exact: true }).waitFor();
  await navigation.waitFor({ state: 'hidden' });
  result.checks.navigation = { accessibleName: '跟进台', touch: [target.width, target.height], itemTouch: [item.width, item.height], keyboardNavigated: true };
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

async function checkProcurementImport(page: Page): Promise<void> {
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
  await page.getByRole('textbox', { name: '跟进记录', exact: true }).fill(memo);
  await page.getByRole('button', { name: '记跟进', exact: true }).click();
  await page.getByText(memo, { exact: true }).waitFor();
  await page.reload();
  await page.getByText(memo, { exact: true }).waitFor();
  await page.screenshot({ path: join(out, 'procurement-component.png'), animations: 'disabled' });

  await page.goto(new URL('/imports?template=po-master-v1&status=committed', origin).href);
  await page.getByRole('link', { name: workbookName, exact: true }).click();
  await page.waitForURL(`**${importPath}?template=po-master-v1&status=committed`);
  result.checks.procurementImport = { workbookName, importPath, componentPath, componentCode, componentPo, linkedFinished: 3, followUp: memo };
}

async function fits(field: Locator) {
  await field.waitFor();
  return field.evaluate((node: BrowserElement) => {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    const cell = node.closest('td');
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
