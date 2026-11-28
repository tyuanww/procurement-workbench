import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, URLSearchParams } from 'node:url';
import type { Locator, Page, Route } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { sidebarLink } from './sidebar.ts';

const sample = new URL('../fixtures/demo/procurement-chase.sql', import.meta.url);
const batch = 'hz09-batch-501';
const filterName = '筛选';
const filterTrigger = /^筛选(?:（\d+）)?$/u;
const chaseName = '按工厂复制';

export function seedChaseSample(): void {
  seedDemoFixture(sample);
}

export function seedDemoFixture(fixture: URL): void {
  const { DATABASE_URL: database, PGBIN: pgBin, E2E_ALLOW_MUTATION: allowed } = process.env;
  assert.equal(allowed, '1');
  assert.ok(database && /^postgresql:\/\/sw_accept@127\.0\.0\.1:\d+\/sw_accept_[0-9a-f]+$/.test(database), '仅在原生验收的临时库建立合成样本');
  const executable = process.platform === 'win32' ? 'psql.exe' : 'psql';
  execFileSync(pgBin === undefined ? executable : join(pgBin, executable), [
    database, '-X', '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(fixture),
  ]);
}

export async function checkChaseToday({ page, origin, out }: {
  readonly page: Page;
  readonly origin: URL;
  readonly out: string;
}) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origin.origin });
  await page.goto(new URL('/today?view=board&reasons=unshipped', origin).href);
  const sampleRows = page.locator('.today-row').filter({ has: page.getByRole('button', { name: /^查看详情 HZ09-\d{4}/ }) });
  const order = (po: string) => sampleRows.filter({ has: page.getByRole('button', { name: `查看详情 ${po}`, exact: false }) });
  await order('HZ09-0001').waitFor();
  for (const lane of ['跟进供应商', '核对收货', '内部待办']) {
    await page.getByRole('region', { name: lane, exact: true }).waitFor();
  }
  assert.equal(await sampleRows.count(), 50);
  await page.getByRole('status').filter({ hasText: /匹配\s*501\s*批未发.*第\s*1\s*页/ }).waitFor();
  await page.getByTitle('下一页', { exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('page') === '2');
  await page.getByRole('status').filter({ hasText: /匹配\s*501\s*批未发.*第\s*2\s*页/ }).waitFor();
  await page.goto(new URL('/today?group=waiting&reasons=unshipped&page=11', origin).href);
  await order('HZ09-0501').waitFor();
  assert.equal(await sampleRows.count(), 1);
  await page.screenshot({ path: join(out, 'procurement-last-page.png'), animations: 'disabled' });

  await page.getByRole('button', { name: chaseName, exact: true }).click();
  const factoryDialog = page.getByRole('dialog', { name: chaseName, exact: true });
  const copiedBeforePreview = await clipboardText(page);
  const filteredCopy = factoryDialog.getByRole('button', { name: /^预览筛选汇总/ });
  await filteredCopy.click();
  const preview = page.getByRole('dialog', { name: '预览内部催货汇总' });
  await preview.getByText(/当前筛选.*2 家工厂.*501 批/).waitFor();
  await factoryDialog.waitFor({ state: 'hidden' });
  assert.equal(await clipboardText(page), copiedBeforePreview);
  await preview.getByRole('button', { name: '返回', exact: true }).click();
  await preview.waitFor({ state: 'hidden' });
  await factoryDialog.waitFor();
  assert.equal(await clipboardText(page), copiedBeforePreview);
  await copyChaseSummary(page, filteredCopy);
  await page.getByRole('status').filter({ hasText: '已复制 501 条催单' }).waitFor();
  await preview.waitFor({ state: 'hidden' });
  const allText = await clipboardText(page);
  assert.ok(allText.startsWith('【内部催货汇总 · 2 家工厂】'));
  assert.deepEqual(purchaseOrders(allText), sampleOrders(501));
  assert.ok(allText.includes('合成催货甲厂') && allText.includes('合成催货乙厂'));
  assert.equal(await factoryDialog.getByRole('button', { name: '复制催单', exact: true }).isEnabled(), false);
  await factoryDialog.getByRole('radio', { name: '合成催货乙厂 · 1 批', exact: true }).waitFor();
  const factoryOption = { name: '合成催货甲厂 · 500 批', exact: true };
  await factoryDialog.getByRole('radio', factoryOption).click();
  await page.waitForURL((url) => url.searchParams.get('chaseFactory') === 'hz09-factory-a' && url.searchParams.get('page') === '11');
  await factoryDialog.getByRole('radio', { ...factoryOption, checked: true }).waitFor();
  await factoryDialog.getByRole('button', { name: '复制该厂 500 批', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已复制 500 条催单' }).waitFor();
  const factoryText = await clipboardText(page);
  assert.deepEqual(purchaseOrders(factoryText), sampleOrders(501).filter((po) => po !== 'HZ09-0250'));
  assert.ok(factoryText.includes('合成催货甲厂'));
  assert.ok(!factoryText.includes('合成催货乙厂'));
  await factoryDialog.getByRole('button', { name: '关闭', exact: true }).click();
  await factoryDialog.waitFor({ state: 'hidden' });
  await checkActionViewSwitch(page);

  await page.goto(new URL('/today?drawer=batch%3Ahz09-batch-250', origin).href);
  const restored = page.getByRole('dialog').filter({ hasText: 'HZ09-0250' });
  await restored.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('drawer'), 'batch:hz09-batch-250');

  const bulk = new URL('/today?reasons=unshipped&sort=bulk&unit=%E4%BB%B6', origin).href;
  await page.goto(bulk);
  await order('HZ09-0501').waitFor();
  await order('HZ09-0001').waitFor();
  const sorted = await sampleRows.getByRole('button', { name: /^查看详情 HZ09-/ }).evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  assert.match(sorted[0] ?? '', /HZ09-0501/);
  assert.match(sorted[1] ?? '', /HZ09-0001/);
  assert.equal(await order('HZ09-0002').count(), 0);
  const clearFilters = page.getByRole('button', { name: '清除筛选', exact: true });
  await clearFilters.evaluate((clear) => {
    const open = globalThis.document.querySelector<HTMLButtonElement>('.today-toolbar-filter');
    if (!(clear instanceof HTMLButtonElement) || open === null) throw new Error('缺少清除筛选或打开筛选的按钮');
    // Reopen before React Router renders the URL change.
    clear.click();
    open.click();
  });
  await clearFilters.waitFor({ state: 'hidden' });
  await page.waitForURL(({ searchParams }) => !['reasons', 'sort', 'unit', 'work'].some((key) => searchParams.has(key)));
  const clearedFilterUrl = page.url();
  const filters = page.getByRole('dialog', { name: filterName, exact: true });
  await filters.getByRole('button', { name: '显示选项', exact: true }).click();
  await filters.getByText('批次按紧急度', { exact: true }).waitFor();
  await filters.getByRole('button', { name: '取消', exact: true }).click();
  await filters.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: '打开菜单', exact: true }).waitFor();
  const tools = page.getByRole('button', { name: '待办操作', exact: true });
  await tools.press('Enter');
  await page.getByRole('menuitem', { name: chaseName, exact: true }).press('Enter');
  await factoryDialog.waitFor();
  await page.keyboard.press('Escape');
  await factoryDialog.waitFor({ state: 'hidden' });
  await tools.and(page.locator(':focus')).waitFor();
  await tools.click();
  await page.getByRole('menuitem', { name: filterName, exact: true }).click();
  await filters.getByRole('button', { name: '显示选项', exact: true }).click();
  await filters.getByText('批次按紧急度', { exact: true }).waitFor();
  await filters.getByRole('radio', { name: /^要催货/ }).click();
  await filters.getByRole('radio', { name: /^要催货/, checked: true }).waitFor();
  assert.equal(page.url(), clearedFilterUrl);
  await filters.getByRole('button', { name: '应用筛选', exact: true }).click();
  await page.waitForURL(({ searchParams }) => searchParams.get('work') === 'factory_chase' && !searchParams.has('sort'));
  await filters.waitFor({ state: 'hidden' });
  const status = page.getByRole('status');
  try {
    await status.filter({ hasText: /匹配\s*501\s*批待催货/ }).waitFor();
  } catch (error) {
    await page.screenshot({ path: join(out, 'procurement-chase-filter-failure.png'), animations: 'disabled' });
    throw new Error(`催货筛选结果 ${JSON.stringify(await status.allTextContents())}，URL ${page.url()}`, { cause: error });
  }
  await page.getByRole('region', { name: '工作台待办' }).and(page.locator(':focus')).waitFor();
  assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
  await page.goto(bulk);
  await order('HZ09-0501').waitFor();
  await order('HZ09-0501').getByRole('button', { name: '复制本批催单' }).click();
  const copied = page.locator('.ant-message').getByRole('status').filter({ hasText: '已复制 1 条催单' });
  await copied.waitFor();
  assert.deepEqual(purchaseOrders(await clipboardText(page)), ['HZ09-0501']);
  assert.equal(await page.getByRole('region', { name: '工作台待办' }).getByText('已复制 1 条催单', { exact: true }).count(), 0);
  await copied.waitFor({ state: 'hidden' });
  await page.screenshot({ path: join(out, 'procurement-bulk-mobile.png'), animations: 'disabled' });
  await recordShipment(page, origin, 25_000);
  await page.reload();
  await order('HZ09-0501').getByText(/未发\s+5,000\s+件/).waitFor();
  await order('HZ09-0501').getByText(/在途待收\s+25,000\s+件/).waitFor();
  assert.match((await sampleRows.first().getByRole('button', { name: /^查看详情/ }).getAttribute('aria-label')) ?? '', /HZ09-0001/);
  await checkBatchProgressChart(page, order('HZ09-0501'), out);
  const receiptDrawer = await checkInlineReceiptDrawer(page, order('HZ09-0501'), out);
  await order('HZ09-0501').getByRole('button', { name: /^更多操作 HZ09-0501/ }).click();
  await page.getByRole('menuitem', { name: '复制本批催单', exact: true }).click();
  await copied.waitFor();
  assert.deepEqual(purchaseOrders(await clipboardText(page)), ['HZ09-0501']);
  const memos = arrivalMemos(page);
  const sourceSearch = new URL(page.url()).search;
  const tabs = page.getByRole('tablist', { name: '今日事项视图' });
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  const navigation = page.getByRole('dialog', { name: '导航' });
  const actionLink = await sidebarLink(navigation, '今日事项', '行动板');
  const arrivalsLink = navigation.getByRole('link', { name: '在途待收', exact: true });
  assert.equal(await actionLink.getAttribute('aria-current'), 'page');
  await navigation.getByRole('link', { name: '今日排期', exact: true }).waitFor();
  await arrivalsLink.click();
  await navigation.waitFor({ state: 'hidden' });
  await tabs.getByRole('tab', { name: '在途待收', selected: true }).waitFor();
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await arrivalsLink.waitFor();
  assert.equal(await arrivalsLink.getAttribute('aria-current'), 'page');
  await page.keyboard.press('Escape');
  await navigation.waitFor({ state: 'hidden' });
  await tabs.getByRole('tab', { name: '行动板' }).click();
  await page.waitForURL((url) => url.search === sourceSearch);
  await page.getByRole('group', { name: '行动摘要' }).getByRole('button', { name: /^在途待收/u }).press('Enter');
  await tabs.getByRole('tab', { name: '在途待收', selected: true }).and(page.locator(':focus')).waitFor();
  await page.getByText(/待收 25,000 件/).waitFor();
  await checkTodayTabHistory({ page, sourceSearch, memo: memos.getByRole('button', { name: /查看批次 HZ09-0501/u }) });
  const scheduled = await recordFollowUp(page, order('HZ09-0501'), '2099-01-11T10:00', '明早十点再联系供应商');
  assert.equal(scheduled.nextFollowUpAt, '2099-01-11T02:00:00.000Z');
  await page.getByRole('button', { name: /切换工作范围$/u }).click();
  await page.getByRole('menuitem', { name: /^已约跟进/ }).click();
  await page.waitForURL((url) => url.searchParams.get('inbox') === 'scheduled');
  await page.reload();
  await order('HZ09-0501').getByText('下次跟进 · 2099-01-11 10:00', { exact: true }).waitFor();
  await recordShipment(page, origin, 5_000);
  await page.reload();
  await page.goto(new URL('/today?view=arrivals', origin).href);
  await memos.getByText(/待收 30,000 件/).waitFor();
  await page.goBack();
  await order('HZ09-0501').getByText('下次跟进 · 2099-01-11 10:00', { exact: true }).waitFor();
  await page.goto(bulk);
  await page.getByRole('region', { name: '工作台待办' }).waitFor();
  await order('HZ09-0001').waitFor();
  assert.equal(await order('HZ09-0501').count(), 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: chaseName, exact: true }).click();
  await copyChaseSummary(page, filteredCopy);
  await page.getByRole('status').filter({ hasText: '已复制 499 条催单' }).waitFor();
  const after = purchaseOrders(await clipboardText(page));
  assert.deepEqual(after, sampleOrders(501).filter((po) => po !== 'HZ09-0501' && po !== 'HZ09-0002'));
  await copyChaseSummary(page, factoryDialog.getByRole('button', { name: /^预览今日汇总/ }));
  await page.getByRole('status').filter({ hasText: '已复制 500 条催单' }).waitFor();
  assert.deepEqual(purchaseOrders(await clipboardText(page)), sampleOrders(501).filter((po) => po !== 'HZ09-0501'));
  await preview.waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await factoryDialog.waitFor({ state: 'hidden' });
  return { total: 501, lastPage: 11, allCopied: 501, factoryCopied: 500, oldDrawerLinkRestored: true, bulkFirst: 'HZ09-0501', batchCopied: 1, remainingAfterPartial: 5_000, inTransitAtEnd: 30_000,
    receiptDrawer,
    followUp: await checkFollowUpReminder({ page, origin, row: order('HZ09-0501'), out }),
  };
}

async function copyChaseSummary(page: Page, button: Locator): Promise<void> {
  await button.click();
  await page.getByRole('dialog', { name: '预览内部催货汇总' }).getByRole('button', { name: '复制内部汇总' }).click();
}

async function checkActionViewSwitch(page: Page): Promise<void> {
  const view = page.getByRole('radiogroup', { name: '工作台视图' });
  const list = view.getByRole('radio', { name: '列表', exact: true });
  const kanban = view.getByRole('radio', { name: '看板', exact: true });
  const filters = page.getByRole('button', { name: filterTrigger });
  const dialog = page.getByRole('dialog', { name: filterName, exact: true });
  const groups = dialog.getByRole('radiogroup', { name: '清单分组' });
  const displayOptions = dialog.getByRole('button', { name: '显示选项', exact: true });
  assert.equal(await view.getByRole('radio').count(), 3);
  assert.equal(await list.isChecked(), true);
  await filters.click();
  await displayOptions.click();
  assert.equal(await groups.getByRole('radio', { name: '等待方', exact: true }).isChecked(), true);
  const initialUrl = page.url();
  const stillUnshipped = dialog.getByRole('checkbox', { name: /^仍待发/ });
  await stillUnshipped.click();
  await dialog.getByRole('checkbox', { name: /^仍待发/, checked: false }).waitFor();
  assert.equal(page.url(), initialUrl);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await filters.and(page.locator(':focus')).waitFor();
  assert.equal(page.url(), initialUrl);

  await filters.click();
  await dialog.getByRole('checkbox', { name: /^仍待发/, checked: true }).waitFor();
  await displayOptions.click();
  const reasonGroup = groups.getByRole('radio', { name: '原因', exact: true });
  await reasonGroup.press('Space');
  await groups.getByRole('radio', { name: '原因', exact: true, checked: true }).waitFor({ state: 'attached' });
  await reasonGroup.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(page.url(), initialUrl);

  for (const { name, group } of [
    { name: '不分组', group: 'priority' },
    { name: '原因', group: 'reason' },
    { name: '日期', group: 'date' },
  ]) {
    await filters.click();
    await displayOptions.click();
    const option = groups.getByRole('radio', { name, exact: true });
    const before = page.url();
    await option.press('Space');
    await groups.getByRole('radio', { name, exact: true, checked: true }).waitFor({ state: 'attached' });
    assert.equal(page.url(), before);
    await dialog.getByRole('button', { name: '应用筛选', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForURL((url) => url.searchParams.get('group') === group);
    assert.equal(await list.isChecked(), true);
  }

  const historyEntries = await page.evaluate(() => window.history.length);
  await kanban.press('Space');
  await page.waitForURL((url) => url.searchParams.get('view') === 'board' && url.searchParams.get('reasons') === 'unshipped' && url.searchParams.get('page') === '11');
  await kanban.and(page.locator(':focus')).waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => window.history.length), historyEntries);
  await page.getByRole('region', { name: '跟进供应商', exact: true }).getByRole('button', { name: /^查看详情 HZ09-0501/ }).waitFor();
  await filters.click();
  await dialog.getByRole('radiogroup', { name: '待办类型' }).getByRole('radio', { checked: true }).and(page.locator(':focus')).waitFor();
  await displayOptions.click();
  assert.equal(await groups.count(), 0);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await list.press('Space');
  await page.waitForURL((url) => url.searchParams.get('view') === 'list' && url.searchParams.get('page') === '11');
  await list.and(page.locator(':focus')).waitFor({ state: 'attached' });
  await filters.click();
  await displayOptions.click();
  await groups.getByRole('radio', { name: '日期', exact: true, checked: true }).waitFor({ state: 'attached' });

  const before = page.url();
  await dialog.getByRole('radio', { name: /^要催货/ }).click();
  await dialog.getByRole('checkbox', { name: /^仍待发/, checked: true }).waitFor();
  await dialog.getByRole('checkbox', { name: /^未发逾期/ }).click();
  await groups.getByRole('radio', { name: '原因', exact: true }).press('Space');
  await dialog.getByRole('combobox', { name: '排序', exact: true }).click();
  await page.getByRole('option', { name: '大批优先 · 同单位列表', exact: true }).click();
  await dialog.getByRole('combobox', { name: '比较单位', exact: true }).click();
  await page.getByRole('option', { name: '件', exact: true }).click();
  assert.equal(page.url(), before);
  await dialog.getByRole('button', { name: '应用筛选', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForURL(({ searchParams }) => searchParams.get('work') === 'factory_chase'
    && searchParams.get('reasons')?.split(',').sort().join(',') === 'overdue,unshipped'
    && searchParams.get('group') === 'reason' && searchParams.get('sort') === 'bulk'
    && searchParams.get('unit') === '件' && !searchParams.has('page'));
  await page.getByRole('status').filter({ hasText: /匹配\s*500\s*批未发/ }).waitFor();
  await page.goBack();
  await page.waitForURL(before);
  await page.getByRole('button', { name: /^查看详情 HZ09-0501/ }).waitFor();
}

async function checkInlineReceiptDrawer(page: Page, row: Locator, out: string) {
  const trigger = row.getByRole('button', { name: /^核对收货 HZ09-0501/ });
  const source = page.url();
  const dialog = page.getByRole('dialog').filter({ hasText: 'HZ09-0501' });
  const record = dialog.getByRole('link', { name: '核对本批记录', exact: true });
  const close = dialog.getByRole('button', { name: '关闭', exact: true });
  const copied = page.locator('.ant-message').getByRole('status').filter({ hasText: '已复制 1 条催单' });
  const widths = [1440, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 320 ? 667 : 900 });
    if (width === 1440) await trigger.press('Enter');
    else await trigger.click();
    await page.waitForURL((url) => url.pathname === '/today' && url.searchParams.get('drawer') === 'batch:' + batch);
    const drawerUrl = page.url();
    await dialog.getByText(/收货方 ·/u).waitFor();
    await dialog.getByRole('group', { name: '批次交付数量', exact: true }).getByText('25,000 件', { exact: true }).waitFor();
    if (width === 320) await page.screenshot({ path: join(out, 'today-batch-record-mobile.png'), animations: 'disabled' });
    if (width === 1440) {
      await dialog.getByRole('button', { name: '登记收货', exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get('drawer') === 'batch:' + batch && url.searchParams.get('draft') === 'receipt');
      assert.equal(Number(await dialog.getByRole('spinbutton', { name: '数量', exact: true }).inputValue()), 25_000);
      await page.keyboard.press('Escape');
      await page.waitForURL(drawerUrl);
      await record.waitFor();
    }
    await copied.waitFor({ state: 'hidden' });
    await page.evaluate(() => globalThis.navigator.clipboard.writeText('批次抽屉验收待写入'));
    await dialog.getByRole('button', { name: '复制本批催单', exact: true }).click();
    await copied.waitFor();
    assert.deepEqual(purchaseOrders(await clipboardText(page)), ['HZ09-0501']);
    assert.equal(page.url(), drawerUrl);
    if (width === 320) {
      const drawer = await dialog.boundingBox();
      const closeBox = await close.boundingBox();
      assert.ok(drawer && drawer.width === 320 && closeBox && closeBox.width >= 44 && closeBox.height >= 44);
    }
    if (width === 1440) await page.keyboard.press('Escape');
    else await close.click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForURL(source);
    await trigger.and(page.locator(':focus')).waitFor();

    await trigger.press('Enter');
    await page.waitForURL(drawerUrl);
    if (width === 1440) await record.press('Enter');
    else await openReceiptRecordOnPhone(page, record);
    await page.waitForURL((url) => url.pathname === '/lines/hz09-line-501' && url.searchParams.get('focusBatch') === batch);
    await page.getByText(/待收 25,000 件/u).first().waitFor();
    if (width === 1440) await page.goBack();
    else await page.getByRole('link', { name: '返回个人工作台', exact: true }).click();
    await page.waitForURL(drawerUrl);
    await record.and(page.locator(':focus')).waitFor();
    await close.click();
    await page.waitForURL(source);
    await dialog.waitFor({ state: 'hidden' });
    await trigger.and(page.locator(':focus')).waitFor();
  }
  await copied.waitFor({ state: 'hidden' });
  await checkReceiptPageRelocation(page, { trigger, record, source });
  await page.setViewportSize({ width: 320, height: 800 });
  return { widths, batch, stayedOnToday: true, copiedOnlySelectedBatch: true, browserBackAndPageReturn: true, focusRestored: true, relocatedPageFocus: true };
}

async function openReceiptRecordOnPhone(page: Page, record: Locator) {
  await record.scrollIntoViewIfNeeded();
  const target = await record.elementHandle();
  assert.ok(target);
  try {
    const visible = await page.waitForFunction((element) => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
      if (left < 0 || top < 0 || right > window.innerWidth || bottom > window.innerHeight) return false;
      const center = document.elementFromPoint(left + width / 2, top + height / 2);
      return center !== null && element.contains(center);
    }, target);
    await visible.dispose();
  } finally {
    await target.dispose();
  }
  const box = await record.boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44, '窄屏批次入口的触控区域须达到 44×44');
  await record.click();
}

async function checkReceiptPageRelocation(page: Page, { trigger, record, source }: {
  readonly trigger: Locator; readonly record: Locator; readonly source: string;
}) {
  const sourcePage = new URL(source).searchParams.get('page') ?? '1';
  const appliedPage = sourcePage === '1' ? 2 : 1;
  await trigger.click();
  await record.click();
  await page.waitForURL((url) => url.pathname === '/lines/hz09-line-501');
  const match = (url: URL) => url.pathname === '/api/v1/today' && url.searchParams.get('focusId') === 'batch:' + batch;
  let relocatedReads = 0;
  const relocate = async (route: Route) => {
    const response = await route.fetch();
    assert.ok(response.ok());
    const body: { readonly items: readonly { readonly id: string }[]; readonly paging: { readonly page: number } } = await response.json();
    assert.ok(body.items.some(({ id }) => id === 'batch:' + batch));
    relocatedReads += 1;
    await route.fulfill({ response, json: { ...body, paging: { ...body.paging, page: appliedPage } } });
  };
  await page.route(match, relocate);
  try {
    await page.getByRole('link', { name: '返回个人工作台', exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get('page') === String(appliedPage) && url.searchParams.get('drawer') === 'batch:' + batch);
    await record.and(page.locator(':focus')).waitFor();
    assert.ok(relocatedReads > 0);
  } finally {
    await page.unroute(match, relocate);
  }
  await page.goto(source);
}

function arrivalMemos(page: Page): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: '待收批次', exact: true }) }).last();
}

async function checkTodayTabHistory({ page, sourceSearch, memo }: { readonly page: Page; readonly sourceSearch: string; readonly memo: Locator }) {
  const tabs = page.getByRole('tablist', { name: '今日事项视图' });
  const action = tabs.getByRole('tab', { name: /行动板$/u });
  const schedule = tabs.getByRole('tab', { name: /今日排期$/u });
  const selectedArrival = tabs.getByRole('tab', { name: /在途待收$/u, selected: true });
  const actionAt = (url: URL) => url.pathname === '/today' && url.search === sourceSearch;
  const arrivalUrl = page.url();
  await schedule.click();
  await schedule.and(page.locator('[aria-selected="true"]')).waitFor();
  const scheduleUrl = page.url();
  await page.goBack();
  await page.waitForURL(arrivalUrl);
  await selectedArrival.waitFor();
  await memo.focus();
  await page.goBack();
  await page.waitForURL(actionAt);
  const selectedAction = action.and(page.locator('[aria-selected="true"]'));
  await selectedAction.waitFor();
  if (!new URLSearchParams(sourceSearch).has('focusId')) await selectedAction.and(page.locator(':focus')).waitFor();
  await page.getByRole('button', { name: /^查看详情 HZ09-0501/ }).waitFor();
  await page.goForward();
  await page.waitForURL(arrivalUrl);
  await selectedArrival.waitFor();
  await memo.waitFor();
  await page.goForward();
  await page.waitForURL(scheduleUrl);
  await schedule.and(page.locator('[aria-selected="true"]')).waitFor();
  await page.getByRole('heading', { name: '今日排期', level: 1, exact: true }).waitFor();
  await action.click();
  await page.waitForURL(actionAt);
}

async function checkBatchProgressChart(page: Page, row: Locator, out: string): Promise<void> {
  const trigger = row.getByRole('button', { name: /^查看详情 HZ09-0501/ });
  await trigger.press('Enter');
  const drawer = page.getByRole('dialog');
  const quantities = drawer.getByRole('group', { name: '批次交付数量', exact: true });
  await quantities.getByText('5,000 件', { exact: true }).waitFor();
  await quantities.getByText('25,000 件', { exact: true }).waitFor();
  const canvas = drawer.locator('canvas');
  await canvas.waitFor();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.ant-drawer')?.querySelector('canvas');
    const context = canvas?.getContext('2d');
    return canvas != null && context != null && context.getImageData(0, 0, canvas.width, canvas.height).data
      .some((value, index) => index % 4 === 3 && value > 0);
  });
  await page.screenshot({ path: join(out, 'procurement-today-batch-chart.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await trigger.and(page.locator(':focus')).waitFor();
}

async function recordFollowUp(page: Page, row: Locator, time: string, text: string) {
  await page.getByRole('region', { name: '工作台待办' }).locator('[aria-busy="false"]:not([aria-live], [inert])').filter({ has: row }).waitFor();
  const direct = row.getByRole('button', { name: /记跟进|跟进工厂/ });
  if (await direct.count() !== 0) await direct.click();
  else {
    await row.getByRole('button', { name: /^更多操作/ }).click();
    await page.getByRole('menuitem', { name: /记跟进/ }).click();
  }
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('内容', { exact: true }).fill(text);
  await dialog.getByLabel('下次跟进时间（选填）', { exact: true }).fill(time);
  const [saved] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/follow-ups' && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: /^确\s*认$/ }).click(),
  ]);
  assert.equal(saved.status(), 200);
  await dialog.waitFor({ state: 'hidden' });
  return saved.json();
}

export async function checkKeyboardReceipt({ page, origin, out }: {
  readonly page: Page;
  readonly origin: URL;
  readonly out: string;
}) {
  const today = new URL('/today?reasons=follow_up_due', origin);
  const row = page.getByRole('button', { name: /^查看详情 HZ09-0501/ });
  const memo = arrivalMemos(page);
  const batchButton = memo.getByRole('button', { name: /HZ09-0501/ });
  const partial = '合成收货单 A · 第一车';
  const remaining = '合成收货单 B · 第二车';
  await page.goto(today.href);
  await row.waitFor();
  await recordKeyboardReceipt(page, { before: 30_000, recv: 12_000, evidence: partial });
  await page.goto(new URL('/today?view=arrivals', origin).href);
  await memo.getByText(/待收 18,000 件 · 实收 12,000 件/).waitFor();
  await batchButton.click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'HZ09-0501' });
  await dialog.getByText(/待收 18,000 件 · 实收 12,000 件/).waitFor();
  await dialog.getByRole('link', { name: '核对本批记录', exact: true }).click();
  await page.getByText('未发 0 件 · 待收 18,000 件 · 实收 12,000 件', { exact: true }).waitFor();
  await page.getByText(/实收登记.*12,000 件.*合成收货单 A/).waitFor();
  await page.screenshot({ path: join(out, 'procurement-partial-receipt.png'), animations: 'disabled' });
  await page.getByRole('link', { name: '返回在途待收', exact: true }).click();
  await page.getByRole('tab', { name: '在途待收', selected: true }).waitFor();
  await dialog.getByRole('link', { name: '核对本批记录', exact: true }).and(page.locator(':focus')).waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await batchButton.and(page.locator(':focus')).waitFor();

  await page.goto(today.href);
  await row.waitFor();
  await recordKeyboardReceipt(page, { before: 18_000, recv: 18_000, evidence: remaining });
  await page.goto(new URL('/today?view=arrivals', origin).href);
  await page.getByRole('heading', { name: '待收批次', exact: true }).or(page.getByText('当前没有在途待收批次。', { exact: true })).waitFor();
  assert.equal(await batchButton.count(), 0);
  await page.goto(new URL('/lines/hz09-line-501?focusBatch=' + batch, origin).href);
  await page.getByText('未发 0 件 · 待收 0 件 · 实收 30,000 件', { exact: true }).waitFor();
  await page.getByText(/实收登记.*18,000 件.*合成收货单 B/).waitFor();
  return { po: 'HZ09-0501', keyboard: ['ArrowDown', 'r'], received: [12_000, 30_000], inTransit: [18_000, 0], evidence: [partial, remaining] };
}

async function recordKeyboardReceipt(page: Page, { before, recv, evidence }: { readonly before: number; readonly recv: number; readonly evidence: string }) {
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('r');
  const dialog = page.getByRole('dialog');
  const qty = dialog.getByRole('spinbutton', { name: '数量', exact: true });
  await qty.waitFor();
  await page.waitForURL((url) => url.searchParams.get('drawer') === 'batch:' + batch && url.searchParams.get('draft') === 'receipt');
  assert.equal(Number(await qty.inputValue()), before);
  await qty.fill(String(recv));
  const date = dialog.getByLabel('收货日', { exact: true });
  await date.fill('2025-02-30');
  await qty.focus();
  await date.and(dialog.locator('[aria-invalid="true"]')).waitFor();
  await dialog.getByText('请输入有效的收货日（YYYY-MM-DD）', { exact: true }).and(dialog.locator('[id$="-error"]')).waitFor();
  assert.equal(await date.inputValue(), '2025-02-30');
  await date.fill('2025-02-02');
  await dialog.getByLabel('收货及归批依据', { exact: true }).fill(evidence);
  const resumeToday = await pauseTodayRefresh(page);
  try {
    const saved = page.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/v1/batches/' + batch + '/receipts'
      && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: /^确\s*认$/ }).press('Enter');
    assert.equal((await saved).status(), 200);
    await page.waitForURL((url) => !url.searchParams.has('drawer') && !url.searchParams.has('draft'));
  } finally {
    await resumeToday();
  }
  await dialog.waitFor({ state: 'hidden' });
}

async function pauseTodayRefresh(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(() => {
    const fetchOriginal = globalThis.fetch;
    const resume = Promise.withResolvers<void>();
    window.addEventListener('resume-today-acceptance', () => {
      globalThis.fetch = fetchOriginal;
      resume.resolve();
    }, { once: true });
    globalThis.fetch = (input, options) => {
      const send = () => fetchOriginal.call(globalThis, input, options);
      return typeof input === 'string' && new URL(input, location.href).pathname === '/api/v1/today'
        ? resume.promise.then(send)
        : send();
    };
  });
  return async () => {
    await page.evaluate(() => { window.dispatchEvent(new window.Event('resume-today-acceptance')); });
  };
}

async function checkFollowUpReminder({ page, origin, row, out }: {
  readonly page: Page;
  readonly origin: URL;
  readonly row: Locator;
  readonly out: string;
}) {
  await page.goto(new URL('/today', origin).href);
  const scheduled = page.getByRole('menuitem', { name: /^已约跟进\s*1/ });
  const filters = page.getByRole('button', { name: filterTrigger });
  const dialog = page.getByRole('dialog', { name: filterName, exact: true });
  const due = dialog.getByRole('checkbox', { name: '到时跟进 1', exact: true });
  await page.getByRole('button', { name: /切换工作范围$/u }).click();
  await scheduled.click();
  await page.waitForURL((url) => url.searchParams.get('inbox') === 'scheduled' && !url.searchParams.has('unit'));
  await row.getByText('下次跟进 · 2099-01-11 10:00', { exact: true }).waitFor();
  assert.equal(await page.locator('.today-row').count(), 1);
  await page.screenshot({ path: join(out, 'procurement-follow-up-scheduled.png'), animations: 'disabled' });

  const changed = await recordFollowUp(page, row, '2025-02-01T10:00', '改期，跟进收货进度');
  assert.equal(changed.nextFollowUpAt, '2025-02-01T02:00:00.000Z');
  await filters.click();
  await due.click();
  await dialog.getByRole('button', { name: '应用筛选', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForURL((url) => url.searchParams.get('reasons') === 'follow_up_due');
  const dueTime = row.getByText('下次跟进 · 2025-02-01 10:00', { exact: true });
  await dueTime.waitFor();
  await row.getByText('已全发 · 在途待收 30,000 件', { exact: true }).waitFor();
  assert.equal(await row.getByRole('button', { name: '复制本批催单' }).count(), 0);
  await page.screenshot({ path: join(out, 'procurement-follow-up-due.png'), animations: 'disabled' });
  await page.reload();
  await dueTime.waitFor();
  await filters.click();
  await dialog.getByRole('checkbox', { name: '到时跟进 1', exact: true, checked: true }).waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  const cleared = await recordFollowUp(page, row, '', '跟进完成，取消提醒');
  assert.equal(cleared.nextFollowUpAt, null);
  await row.waitFor({ state: 'hidden' });
  await filters.click();
  await dialog.waitFor();
  await due.waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /^撤\s*销$/ }).click();
  await dueTime.waitFor();
  await page.screenshot({ path: join(out, 'procurement-follow-up-undo.png'), animations: 'disabled' });
  await page.goto(new URL('/lines/hz09-line-501', origin).href);
  await page.getByRole('heading', { name: '时间线', exact: true }).waitFor();
  await page.getByText('下次跟进 · 2025-02-01 10:00', { exact: true }).waitFor();
  return { scheduledAt: '2099-01-11T02:00:00.000Z', changedAt: changed.nextFollowUpAt, clear: cleared.nextFollowUpAt, undo: true, timeline: true, fullShipmentStillInTransit: true };
}

export async function checkFirstBatch({ page, origin, buyer, warehouse }: {
  readonly page: Page;
  readonly origin: URL;
  readonly buyer: string;
  readonly warehouse: string;
}) {
  const line = await page.request.post(new URL('/api/v1/lines', origin).href, {
    data: { nameRaw: '合成待建首批', lane: 'finished', poRaw: 'SYNTHETIC-FIRST-BATCH', qtyOrdered: 120, unit: '件', receiverPartyId: warehouse, buyerUserId: buyer },
  });
  assert.ok(line.ok());
  const { line: { id } } = await line.json();
  assert.equal(typeof id, 'string');
  const summary = page.getByRole('group', { name: '行动摘要', exact: true });
  const shortcut = summary.getByRole('button', { name: /^待建批次\s*\d+\s*行$/u });
  const order = page.getByRole('link', { name: '查看订单', exact: true }).and(page.locator('a[href="/lines/' + encodeURIComponent(id) + '"]'));
  for (const filter of ['reasons=unshipped', 'work=factory_chase', 'group=priority&reasons=unshipped']) {
    await page.goto(new URL('/today?' + filter, origin).href);
    await shortcut.waitFor();
    assert.equal(await order.count(), 0);
    await shortcut.click();
    await page.waitForURL((url) => !url.searchParams.has('work') && !url.searchParams.has('reasons'));
    await page.waitForFunction(() => document.activeElement?.id === 'today-pending-batches');
    await order.waitFor();
  }

  await page.goto(new URL('/today?view=board', origin).href);
  const internal = page.getByRole('region', { name: '内部待办', exact: true });
  const link = internal.getByRole('link', { name: '查看订单', exact: true }).and(order);
  await link.click();
  await page.getByRole('link', { name: '返回待建批次', exact: true }).click();
  await link.waitFor();
  await page.waitForFunction((href) => document.activeElement?.getAttribute('href') === href, '/lines/' + encodeURIComponent(id));
  assert.equal(await order.count(), 1);
  assert.equal(await page.getByRole('heading', { name: '待建批次', exact: true }).count(), 0);
  await link.locator('..').getByRole('button', { name: '生成首批次', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已生成首批次' }).waitFor();
  await order.waitFor({ state: 'hidden' });
  const detail = await page.request.get(new URL('/api/v1/lines/' + encodeURIComponent(id), origin).href);
  assert.ok(detail.ok());
  const { batches } = await detail.json();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].plannedQty, 120);
  return { pendingBefore: 1, pendingAfter: 0, created: batches.length, filteredShortcuts: true, listShortcut: true, returnedToOrder: true };
}

function sampleOrders(count: number): string[] {
  return Array.from({ length: count }, (_, index) => 'HZ09-' + String(index + 1).padStart(4, '0'));
}

function purchaseOrders(text: string): string[] {
  return (text.match(/\bHZ09-\d{4}\b/g) ?? []).sort();
}

async function clipboardText(page: Page): Promise<string> {
  return page.evaluate(() => globalThis.navigator.clipboard.readText());
}

async function recordShipment(page: Page, origin: URL, qty: number): Promise<void> {
  const response = await page.request.post(new URL('/api/v1/batches/' + batch + '/shipments', origin).href, {
    data: { qty, shippedOn: '2025-02-01', fulfillment: { kind: 'verified', unit: '件', evidence: '原生验收合成发货凭据' } },
  });
  assert.ok(response.ok(), '合成发货 HTTP ' + response.status());
}

export async function checkTodayDrawer(page: Page, origin: URL) {
  const listUrl = new URL('/today?group=waiting&reasons=unshipped&page=11', origin);
  const detailUrl = new URL(listUrl);
  detailUrl.searchParams.set('drawer', 'batch:' + batch);
  const detail = page.getByRole('button', { name: /^查看详情 HZ09-0501/ });
  const dialog = page.getByRole('dialog');
  const close = dialog.getByRole('button', { name: '关闭', exact: true });

  await page.goto(listUrl.href);
  await detail.focus();
  await page.keyboard.press('Enter');
  await dialog.getByText(/HZ09-0501/).waitFor();
  await page.waitForURL(detailUrl.href);
  await page.keyboard.press('Escape');
  await page.waitForURL(listUrl.href);
  await dialog.waitFor({ state: 'hidden' });
  await page.goBack();
  assert.equal(page.url(), detailUrl.href);
  await dialog.getByText(/HZ09-0501/).waitFor();
  await page.goForward();
  assert.equal(page.url(), listUrl.href);
  await dialog.waitFor({ state: 'hidden' });

  for (let attempt = 0; attempt < 3; attempt++) {
    await detail.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForURL(listUrl.href);
  }
  await checkEscapeBeforeDrawerPaint(page, detail, dialog, listUrl);

  await page.reload();
  await page.getByRole('status').filter({ hasText: /匹配\s*501\s*批未发.*第\s*11\s*页/ }).waitFor();
  await detail.waitFor();
  assert.equal(page.url(), listUrl.href);
  assert.equal(await dialog.isVisible(), false);

  const draftUrl = new URL(detailUrl);
  draftUrl.searchParams.set('draft', 'date');
  await page.goto(draftUrl.href);
  const date = dialog.getByRole('textbox', { name: '确认日', exact: true });
  await date.waitFor();
  assert.equal(await date.inputValue(), '2025-02-01');
  await close.focus();
  await page.keyboard.press('Escape');
  await page.waitForURL(detailUrl.href);
  await date.waitFor({ state: 'hidden' });
  await close.click();
  await page.waitForURL(listUrl.href);
  await dialog.waitFor({ state: 'hidden' });
  return { settledEscape: true, browserHistoryRestored: true, quickEscapes: 3, escapeBeforePaint: true, filterOnReload: 'unshipped', pageOnReload: 11, draftLinkRestored: true, draftEscape: true, mouseClose: true };
}

async function checkEscapeBeforeDrawerPaint(page: Page, trigger: Locator, dialog: Locator, list: URL) {
  const handled = await trigger.evaluate((element) => {
    if (!('click' in element)) return false;
    element.click();
    const escape = new globalThis.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    element.dispatchEvent(escape);
    return escape.defaultPrevented;
  });
  assert.ok(handled, '抽屉打开请求尚未渲染时也应受理 Esc');
  await page.waitForURL(list.href);
  await dialog.waitFor({ state: 'hidden' });
}
