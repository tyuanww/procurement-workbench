import assert from 'node:assert/strict';
import type { Page, Route, URLMatch } from '../node_modules/.pnpm/node_modules/playwright/index.js';

export async function checkRedReview({ page, origin }: { readonly page: Page; readonly origin: URL }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await checkLineQuery(page, origin);
  await checkProductDirectory(page, origin);
  await checkDashboardSourceRetry(page, origin);
  await page.setViewportSize({ width: 320, height: 640 });
  await checkLinePreviewFocus(page, origin);
  await checkScheduleFilters(page, origin);
  await page.setViewportSize({ width: 1440, height: 900 });
  return { selectionScope: true, searchRetry: true, listReturn: true, directoryFacts: true, sourceRetry: true, previewFocus: true, narrowSchedule: true };
}

function order(page: Page, id: string) {
  return page.getByRole('link', { name: id, exact: true });
}

async function searchLines(page: Page, id: string): Promise<void> {
  const search = page.getByLabel('搜索单号、品名或编码');
  await search.fill(id);
  await search.press('Enter');
  await page.waitForURL((url) => url.searchParams.get('q') === id);
}

async function checkLineQuery(page: Page, origin: URL): Promise<void> {
  await page.goto(new URL('/lines?q=UI-DEMO-001&pageSize=20', origin).href);
  await order(page, 'UI-DEMO-001').waitFor();
  const overview = page.getByRole('button', { name: '筛选结果概览', exact: true });
  const metrics = page.getByRole('group', { name: '跟进中心筛选结果指标' });
  assert.equal(await overview.getAttribute('aria-expanded'), 'false');
  assert.equal(await metrics.isVisible(), false);
  await overview.press('Space');
  await metrics.waitFor();
  await page.getByRole('checkbox', { name: /勾选订单行.*UI-DEMO-001/ }).check();
  await searchLines(page, 'UI-DEMO-002');
  await order(page, 'UI-DEMO-002').waitFor();
  assert.equal(await overview.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.getByLabel('搜索单号、品名或编码').evaluate((input) => input === document.activeElement), true);
  await page.getByRole('button', { name: '查看结果', exact: true }).press('Enter');
  const results = page.getByRole('region', { name: '订单查询结果' });
  assert.equal(await results.evaluate((element) => element === document.activeElement), true);
  await page.getByRole('button', { name: '按总表生成批次', exact: true }).waitFor({ state: 'hidden' });
  await checkLineBulkTarget(page);

  const request: URLMatch = (url) => url.pathname === '/api/v1/lines' && url.searchParams.get('q') === 'UI-DEMO-001';
  const fail = (route: Route) => route.abort('failed');
  await page.route(request, fail);
  try {
    await searchLines(page, 'UI-DEMO-001');
    await page.getByText('订单行没有读出来', { exact: true }).waitFor();
    await order(page, 'UI-DEMO-002').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: /^重\s*试$/ }).first().waitFor();
  } finally {
    await page.unroute(request, fail);
  }

  await page.getByRole('button', { name: /^重\s*试$/ }).first().click();
  await order(page, 'UI-DEMO-001').waitFor();
  await order(page, 'UI-DEMO-001').click();
  await page.getByRole('link', { name: '返回跟进中心', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/lines' && url.searchParams.get('q') === 'UI-DEMO-001' && url.searchParams.get('pageSize') === '20');
  await page.waitForFunction(() => document.activeElement?.textContent === 'UI-DEMO-001');
}

async function checkLineBulkTarget(page: Page): Promise<void> {
  const request: URLMatch = (url) => url.pathname === '/api/v1/lines/bulk/hint-batches';
  const simulate = (route: Route) => route.fulfill({ json: { created: 0, skipped: [] } });
  await page.route(request, simulate);
  try {
    await page.getByRole('checkbox', { name: /勾选订单行.*UI-DEMO-002/ }).check();
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/api/v1/lines/bulk/hint-batches');
    await page.getByRole('button', { name: '按总表生成批次', exact: true }).click();
    assert.deepEqual((await response).request().postDataJSON(), { lineIds: ['ui-demo-line-no-date'], includeCompleted: false });
    await order(page, 'UI-DEMO-002').waitFor();
  } finally {
    await page.unroute(request, simulate);
  }
}

async function checkProductDirectory(page: Page, origin: URL): Promise<void> {
  await page.goto(new URL('/products?q=2099000000101', origin).href);
  const product = page.locator('main a[href="/products/ui-demo-cleanser"]');
  await product.waitFor();
  const card = await product.innerText();
  assert.match(card, /2099000000101/);
  assert.doesNotMatch(card, /采购中|工厂库存|BOM|联系人/);
}

async function checkDashboardSourceRetry(page: Page, origin: URL): Promise<void> {
  const request: URLMatch = (url) => url.pathname === '/api/v1/dashboard/bottlenecks';
  const fail = (route: Route) => route.abort('failed');
  await page.route(request, fail);
  try {
    await page.goto(new URL('/dashboard', origin).href);
    await page.getByText(/来源汇总.*没有读出来|来源汇总.*失败/).first().waitFor();
  } finally {
    await page.unroute(request, fail);
  }
  await page.getByRole('button', { name: '重试来源汇总', exact: true }).click();
  await page.getByRole('group', { name: '来源汇总', exact: true }).getByRole('link').first().waitFor();
}

async function checkLinePreviewFocus(page: Page, origin: URL): Promise<void> {
  await page.goto(new URL('/lines?q=UI-DEMO-001', origin).href);
  const row = page.getByRole('row').filter({ has: order(page, 'UI-DEMO-001') });
  await row.waitFor();
  const position = await row.boundingBox();
  assert.ok(position !== null && position.y >= 0 && position.y < 640, '320px 宽度的首屏应看到搜索结果');
  const trigger = row.getByRole('button', { name: /^预\s*览$/ }).first();
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.textContent?.replace(/\s/g, '') === '预览');
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true);
  await page.goto(new URL('/lines?q=UI-DEMO-001&drawer=preview&lineId=ui-demo-line-chase', origin).href);
  await dialog.getByText('订单行摘要', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.id === 'line-search-results');
}

async function checkScheduleFilters(page: Page, origin: URL): Promise<void> {
  await page.goto(new URL('/progress/schedule', origin).href);
  const filters = page.getByRole('group', { name: '排期筛选', exact: true });
  await filters.getByRole('combobox', { name: '店铺', exact: true }).waitFor();
  assert.equal(await filters.getByRole('combobox').count(), 1);
  const more = filters.getByRole('button', { name: /^更多筛选/u });
  const extra = page.getByRole('group', { name: '更多筛选条件', exact: true });
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  await more.press('Enter');
  await extra.getByRole('combobox', { name: '负责人', exact: true }).waitFor();
  await extra.getByRole('combobox', { name: '供应商', exact: true }).waitFor();
  await extra.getByRole('combobox', { name: '工厂', exact: true }).waitFor();
  await extra.getByRole('combobox', { name: '状态', exact: true }).click();
  await page.getByRole('option', { name: '已完成', exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('status') === 'done');
  await filters.getByRole('button', { name: '更多筛选 · 1', exact: true }).waitFor();
  await more.press('Enter');
  await extra.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '清除状态筛选 已完成', exact: true }).press('Enter');
  await page.waitForURL((url) => !url.searchParams.has('status'));
  assert.equal(await more.evaluate((button) => button === document.activeElement), true);
  const results = page.getByRole('region', { name: '排期结果', exact: true });
  const firstBatch = results.getByRole('button', { name: /查看批次/u }).first();
  await firstBatch.waitFor();
  const position = await firstBatch.boundingBox();
  assert.ok(position !== null && position.y >= 0 && position.y < 640, '320px 宽度的首屏应看到待交批次');
  const searchTrigger = page.getByRole('button', { name: '搜索排期', exact: true });
  const searchInput = page.getByRole('textbox', { name: '搜索排期', exact: true });
  assert.equal(await searchInput.isVisible(), false);
  await searchTrigger.click();
  await searchInput.waitFor();
  assert.equal(await searchInput.evaluate((input) => input === document.activeElement), true);
  const promptFits = await searchInput.evaluate((input: HTMLInputElement) => {
    const style = getComputedStyle(input);
    const context = document.createElement('canvas').getContext('2d');
    if (context === null) return false;
    context.font = style.font;
    const inner = input.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    return context.measureText(input.placeholder).width <= inner;
  });
  assert.equal(promptFits, true, '320px 宽度可完整读取搜索提示');
  await searchInput.fill('确认今日出货');
  await searchInput.press('Enter');
  await results.getByRole('button', { name: /确认今日出货/u }).waitFor();
  await searchInput.press('Escape');
  await searchInput.waitFor({ state: 'hidden' });
  assert.equal(await searchTrigger.evaluate((button) => button === document.activeElement), true);
  await page.locator('.planning-period').getByText('日', { exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('scale') === 'day');
  const date = page.getByLabel('选择排期日期', { exact: true });
  await date.waitFor();
  const selected = await date.inputValue();
  await page.getByRole('button', { name: '下一日', exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('from') !== selected);
}
