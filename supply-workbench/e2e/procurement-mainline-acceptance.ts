import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { URLSearchParams } from 'node:url';
import type { Locator, Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { sidebarLink } from './sidebar.ts';

const finishedPo = 'PO20261117009001';
const finishedName = '测试成品水';
const store = 'dafuyan';
const storeName = '达肤妍';
const otherStoreName = '译龄';

type Scenario = { readonly origin: URL; readonly out: string };

export async function checkStoreSchedule({ page, manager, origin, out }: Scenario & { readonly page: Page; readonly manager: Page }) {
  await (await sidebarLink(manager.locator('aside'), '管理店铺', '当前进度')).click();
  const current = manager.getByRole('region', { name: '当前进度表', exact: true });
  const finished = current.getByRole('link', { name: finishedName, exact: true });
  await select(manager.getByRole('combobox', { name: '店铺', exact: true }), manager, storeName);
  await finished.waitFor();
  const breadcrumb = manager.locator('header').getByRole('navigation', { name: '当前位置' });
  await breadcrumb.getByText('管理店铺', { exact: true }).waitFor();
  await breadcrumb.getByText('当前进度', { exact: true }).waitFor();
  const filters = manager.getByRole('group', { name: '当前进度筛选' });
  const oa = await filters.getByRole('combobox', { name: 'OA 需求' }).boundingBox();
  const stay = filters.getByRole('combobox', { name: '停留天数' });
  const days = await stay.boundingBox();
  const table = await current.getByRole('table').last().boundingBox();
  const viewport = manager.viewportSize();
  assert.ok(oa && days && table && viewport);
  assert.ok(days.x > oa.x && table.y > days.y, 'OA、停留天数和表格的位置应从筛选条到结果');
  assert.ok(table.x + table.width <= viewport.width, '当前进度表格应容纳在桌面可视范围');
  assert.ok(table.y < viewport.height, '桌面首屏应能看到订单清单');
  const progressStages = manager.getByRole('group', { name: '按进度阶段筛选' });
  const denominator = manager.getByText(/^[\d,]+ 条订单行$/u);
  await denominator.waitFor();
  assert.equal(await current.getByText(/^(进行中|共|匹配) [\d,]+ 行$/u).count(), 0);
  const noBatch = progressStages.getByRole('button', { name: /^待建批次 / });
  const stageCount = (await noBatch.innerText()).match(/待建批次 ([\d,]+) 行/u)?.[1];
  assert.ok(stageCount);
  await noBatch.click();
  await progressStages.getByRole('button', { name: /^待建批次 /, pressed: true }).waitFor();
  await current.getByRole('status').and(current.getByText(`匹配 ${stageCount} 行`, { exact: true })).waitFor();
  await denominator.waitFor();
  assert.equal(new URL(manager.url()).searchParams.get('drill'), 'stage:no_batch');
  await select(stay, manager, '15+ 天');
  await manager.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' });
  await filters.getByTitle('15+ 天', { exact: true }).waitFor();
  const selected = new URL(manager.url()).searchParams;
  assert.equal(selected.get('stay'), '15+');
  assert.equal(selected.get('drill'), 'stage:no_batch');
  const clear = filters.getByRole('button', { name: '清除下钻' });
  await manager.bringToFront();
  await clear.focus();
  await manager.keyboard.press('Enter');
  await clear.and(manager.locator('[aria-disabled="true"]')).waitFor();
  const cleared = new URL(manager.url()).searchParams;
  assert.equal(cleared.get('drill'), null);
  assert.equal(cleared.get('stay'), '15+');
  assert.equal(await clear.evaluate((button) => button === document.activeElement), true);
  await select(stay, manager, '全部停留');
  await finished.waitFor();
  await select(manager.getByRole('combobox', { name: '店铺', exact: true }), manager, otherStoreName);
  await current.getByText('所选范围没有进行中的成品订单行。', { exact: true }).waitFor();
  assert.equal(await finished.count(), 0);

  await page.goto(new URL('/progress?store=' + store, origin).href);
  await (await sidebarLink(page.locator('aside'), '管理店铺', '总排期')).click();
  const panel = page.getByRole('region', { name: '成品订单排期' });
  await select(panel.getByRole('combobox', { name: '选择成品订单' }), page, new RegExp(finishedPo));
  const line = panel.getByRole('link', { name: '成品订单行详情', exact: true });
  await line.waitFor();
  assert.equal(new URL(await line.getAttribute('href') ?? '', origin).searchParams.get('store'), store);
  const basis = '合成验收周期依据';
  for (const [label, days] of [['下单至齐料（天）', '3'], ['生产周期（天）', '4'], ['生产结束至交付（天）', '2']]) {
    await panel.getByRole('spinbutton', { name: label, exact: true }).fill(days);
  }
  await panel.getByLabel('周期依据', { exact: true }).fill(basis);
  const preview = panel.getByRole('list', { name: '计划节点预览' });
  await preview.getByText('交付 2026-11-26', { exact: true }).waitFor();
  await panel.getByRole('button', { name: '建立排期', exact: true }).click();
  const stages = panel.getByRole('list', { name: '已建排期节点' });
  await stages.waitFor();
  await page.getByText('月', { exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get('scale') === 'month' && url.searchParams.get('store') === store);
  await page.reload();
  await stages.waitFor();
  assert.deepEqual(await stages.getByRole('button', { name: /^(下单|齐料|生产|交付)$/ }).allTextContents(), ['下单', '齐料', '生产', '交付']);
  await panel.getByText('周期依据 ' + basis + ' · 齐料间隔 3 天 · 生产 4 天 · 交付间隔 2 天', { exact: true }).waitFor();
  const scheduleMetrics = page.getByRole('group', { name: '总排期指标' });
  const monthlyTotal = scheduleMetrics.locator('.ant-card').filter({ hasText: '所选月任务' });
  await monthlyTotal.getByText('4', { exact: true }).waitFor();
  await page.getByText(/^左端虚线表示任务在所选期间前已开始/u).waitFor();
  assert.equal(await page.getByText(/按负责人分组|点任务条打开|本月排期/u).count(), 0);
  await page.screenshot({ path: join(out, 'procurement-schedule.png'), animations: 'disabled' });
  await checkScheduleWindow(page, origin, out);
  await page.goto(new URL('/today', origin).href);
  const scheduleTab = page.getByRole('main').getByRole('tab', { name: '今日排期', exact: true });
  await scheduleTab.press('Enter');
  await page.waitForURL((url) => url.pathname === '/today' && url.searchParams.get('group') === 'schedule');
  await page.getByRole('button', { name: '下单', exact: true }).filter({ hasText: finishedPo }).press('Enter');
  const task = page.getByRole('dialog');
  await task.getByText(finishedPo + ' · ' + finishedName, { exact: true }).waitFor();
  await task.getByRole('button', { name: /^关\s*闭$/ }).last().click();
  await task.waitFor({ state: 'hidden' });
  const totalSchedule = await sidebarLink(page.locator('aside'), '管理店铺', '总排期');
  await totalSchedule.click();
  await page.waitForURL((url) => url.pathname === '/progress/schedule');
  const taskContext = await checkScheduleTaskContext(page, origin);
  return { store, excludedStore: 'yiling', po: finishedPo, stages: ['下单', '齐料', '生产', '交付'], plannedDelivery: '2026-11-26', restoredScale: 'month', todayScheduleLink: true, taskContext };
}

async function checkScheduleWindow(page: Page, origin: URL, out: string) {
  await page.goto(new URL(`/progress/schedule?store=${store}&from=2026-11-23`, origin).href);
  const dateRange = page.locator('[aria-live="polite"]');
  const tasks = page.getByRole('group', { name: '总排期指标' }).getByText('所选周任务', { exact: true });
  const production = page.getByRole('button', { name: /^生产\s/u });
  const borderStyles = () => production.evaluate((bar) => {
    const css = getComputedStyle(bar);
    return [css.borderLeftStyle, css.borderRightStyle, css.borderTopStyle, css.borderBottomStyle];
  });
  await dateRange.and(page.getByText(/11-23 至 (?:2026-)?11-29$/u)).waitFor();
  await tasks.waitFor();
  assert.deepEqual(await borderStyles(), ['dashed', 'solid', 'solid', 'solid']);
  await page.getByRole('button', { name: '上一周', exact: true }).click();
  await dateRange.and(page.getByText(/11-16 至 (?:2026-)?11-22$/u)).waitFor();
  await tasks.waitFor();
  await page.getByRole('button', { name: /^下单\s/u }).waitFor();
  assert.deepEqual(await borderStyles(), ['solid', 'dashed', 'solid', 'solid']);
  assert.equal(await page.getByText(/本周任务|本周排期/u).count(), 0);
  const desktop = page.viewportSize();
  assert.ok(desktop);
  await page.setViewportSize({ width: 320, height: 800 });
  const legend = page.getByText(/^左端虚线表示任务在所选期间前已开始/u);
  await legend.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /^下单\s/u }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  await page.screenshot({ path: join(out, 'procurement-schedule-320.png'), animations: 'disabled' });
  await page.setViewportSize(desktop);
}

async function checkScheduleTaskContext(page: Page, origin: URL) {
  const predecessor = '合成排期前置任务';
  const successor = '合成排期接续任务';
  const businessDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format();
  const monday = new Date(businessDay + 'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - 7);
  const predecessorStart = monday.toISOString().slice(0, 10);
  monday.setUTCDate(monday.getUTCDate() + 1);
  const predecessorEnd = monday.toISOString().slice(0, 10);
  monday.setUTCDate(monday.getUTCDate() + 1);
  const plannedEnd = monday.toISOString().slice(0, 10);
  const fromItemId = await createScheduleTask(page, origin, predecessor, predecessorStart, predecessorEnd);
  const toItemId = await createScheduleTask(page, origin, successor, predecessorEnd, plannedEnd);
  const dependency = await page.request.post(new URL('/api/v1/plan/work-item-dependencies', origin).href, { data: { fromItemId, toItemId } });
  assert.ok(dependency.ok(), '合成排期依赖 HTTP ' + dependency.status());
  for (const [id, status] of [[fromItemId, 'in_progress'], [fromItemId, 'blocked'], [toItemId, 'in_progress']]) {
    const response = await page.request.post(new URL(`/api/v1/plan/work-items/${id}/status`, origin).href, { data: { status } });
    assert.ok(response.ok(), '合成排期状态 HTTP ' + response.status());
  }

  await page.goto(new URL('/today?group=owner', origin).href);
  await page.getByRole('button', { name: successor, exact: true }).press('Enter');
  const drawer = page.getByRole('dialog', { name: new RegExp(successor) });
  const warning = drawer.getByText(`${predecessor}（计划完成 ${predecessorEnd}）仍阻塞`, { exact: false });
  await warning.waitFor();
  const todayUrl = page.url();
  assert.equal(new URL(todayUrl).searchParams.get('drawer'), 'task:' + toItemId);
  const scheduleLink = drawer.getByRole('link', { name: '在总排期查看此任务', exact: true });
  await scheduleLink.click();
  await page.waitForURL((url) => url.pathname === '/progress' && url.searchParams.get('view') === 'schedule'
    && url.searchParams.get('from') === plannedEnd && url.searchParams.get('drawer') === 'task:' + toItemId);
  await scheduleLink.waitFor({ state: 'hidden' });
  await warning.waitFor();
  const taskBar = page.getByRole('button', { name: new RegExp('^' + successor + '\\s'), includeHidden: true });
  await taskBar.waitFor();
  const dependencyHint = page.getByText(`依赖冲突 · ${predecessor}（计划完成 ${predecessorEnd}）仍阻塞`, { exact: true });
  await dependencyHint.waitFor();
  await page.goBack();
  await page.waitForURL(todayUrl);
  await scheduleLink.waitFor();
  await warning.waitFor();
  return { task: successor, predecessor, scheduleAnchor: plannedEnd, visibleInTimeline: true, restoredTodayContext: true };
}

async function createScheduleTask(page: Page, origin: URL, title: string, plannedStart: string, plannedEnd: string) {
  const response = await page.request.post(new URL('/api/v1/plan/work-items', origin).href, {
    data: { subjectType: 'standalone', kind: 'task', title, plannedStart, plannedEnd },
  });
  assert.ok(response.ok(), '合成排期任务 HTTP ' + response.status());
  const result: unknown = await response.json();
  assert.ok(typeof result === 'object' && result !== null && 'workItemId' in result && typeof result.workItemId === 'string');
  return result.workItemId;
}

export async function checkProductDevelopment({ buyer, reviewer, buyerId, reviewerId, origin, out }: Scenario & {
  readonly buyer: Page;
  readonly reviewer: Page;
  readonly buyerId: string;
  readonly reviewerId: string;
}) {
  const projectId = randomUUID();
  const nodeId = randomUUID();
  const title = '合成新品研发';
  const node = '合成成品首批入仓';
  const required = '2026-11-23';
  const promised = '2026-11-24';
  const evidence = '合成供应商回复，首批周二到仓';
  await seedDevelopment(reviewer, origin, 'projects', { id: projectId, title, store, productLeadUserId: reviewerId });
  await seedDevelopment(reviewer, origin, 'nodes', {
    id: nodeId, projectId, title: node, destination: 'finished_to_warehouse',
    plannedStart: '2026-11-19', plannedEnd: required, ownerUserId: reviewerId, buyerUserId: buyerId,
  });
  await buyer.goto(new URL('/progress?store=' + store, origin).href);
  await (await sidebarLink(buyer.locator('aside'), '管理店铺', '新品开发进度')).click();
  const pending = buyer.locator('.ant-card').filter({ has: buyer.getByText('采购待跟进（1）', { exact: true }) });
  await pending.getByRole('button', { name: node, exact: true }).click();
  const detail = buyer.getByRole('dialog', { name: node, exact: true });
  await detail.getByText('项目要求 ' + required, { exact: true }).waitFor();
  await detail.getByRole('button', { name: '记录采购回复', exact: true }).click();
  const reply = buyer.getByRole('dialog', { name: '记录采购回复', exact: true });
  await fillDate(reply.getByLabel('供应商承诺日期', { exact: true }), promised);
  await reply.getByLabel('回复和凭据', { exact: true }).fill(evidence);
  await reply.getByRole('button', { name: '保存采购回复', exact: true }).click();
  await detail.getByText(evidence, { exact: true }).waitFor();
  await reviewer.goto(buyer.url());
  const reviewDetail = reviewer.getByRole('dialog', { name: node, exact: true });
  await reviewDetail.getByText('供应商承诺 ' + promised, { exact: true }).waitFor();
  await reviewDetail.getByText(evidence, { exact: true }).waitFor();
  await reviewDetail.getByRole('button', { name: '关联正式订单', exact: true }).click();
  const link = reviewer.getByRole('dialog', { name: '关联正式订单', exact: true });
  await link.getByLabel('搜索 OA 编号', { exact: true }).fill('9901');
  await link.getByRole('button', { name: '查找订单', exact: true }).click();
  await select(link.getByRole('combobox'), reviewer, new RegExp(finishedPo));
  await link.getByRole('button', { name: '确认关联', exact: true }).click();
  const oa = reviewDetail.getByRole('link', { name: 'OA XPKA(CN)9901', exact: true });
  await oa.waitFor();
  await reviewer.reload();
  await oa.waitFor();
  await reviewDetail.getByText(evidence, { exact: true }).waitFor();
  await reviewer.screenshot({ path: join(out, 'procurement-development.png'), animations: 'disabled' });
  return { project: title, node, required, promised, evidence, linkedPo: finishedPo, linkedOa: 'XPKA(CN)9901' };
}

export async function checkManagementMeeting({ page, origin, out, materialPo }: Scenario & {
  readonly page: Page;
  readonly materialPo: string;
}) {
  await page.goto(new URL('/dashboard', origin).href);
  await (await sidebarLink(page.locator('aside'), '管理看板', '管理周会')).click();
  await select(page.getByRole('combobox', { name: '店铺', exact: true }), page, otherStoreName);
  await page.getByText('这个店铺没有采购事项。', { exact: true }).waitFor();
  await select(page.getByRole('combobox', { name: '店铺', exact: true }), page, storeName);
  await page.waitForURL((url) => url.searchParams.get('store') === store);
  const liveMeeting = page.url();
  const weekStart = new URL(liveMeeting).searchParams.get('weekStart');
  assert.ok(weekStart, '周会 URL 应记录当前周期');
  const reports = page.getByRole('link', { name: '查看周报', exact: true });
  const weekInput = page.getByLabel('周一', { exact: true });
  await page.getByRole('button', { name: /^上\s*周$/ }).click();
  const previousWeek = new URL(page.url()).searchParams.get('weekStart');
  assert.ok(previousWeek && previousWeek < weekStart);
  await reports.click();
  await page.waitForURL((url) => url.pathname === '/reports' && url.searchParams.get('weekStart') === previousWeek);
  assert.equal(await weekInput.inputValue(), previousWeek);
  await page.goto(liveMeeting);

  const search = page.getByRole('textbox', { name: '搜索采购事项' });
  const material = page.getByRole('row').filter({ hasText: materialPo });
  await material.getByText(/订购 200,000/).waitFor();
  assert.equal(await page.getByText(/起一周的最后承诺/u).count(), 0);
  await search.fill(materialPo);
  await page.getByRole('status').filter({ hasText: '找到 1 条采购事项' }).waitFor();
  await material.getByText(/报告已送 158,000/).waitFor();
  await material.getByText('报告差额 42,000 （单位待核）', { exact: true }).waitFor();
  await material.getByText('测试成品水 · XPKA(CN)9901', { exact: true }).waitFor();
  await material.getByText('测试成品乳 · XPKA(CN)9901', { exact: true }).waitFor();
  const decision = '合成周会决定，先核实盖子到厂单';
  const criteria = '回查合成运输单与到厂签收';
  const evidence = '合成签收单已核对';
  await material.getByRole('button', { name: '记录决定', exact: true }).click();
  const form = page.getByRole('dialog', { name: '记录周会决定', exact: true });
  await form.getByLabel('决定', { exact: true }).fill(decision);
  await select(form.getByRole('combobox', { name: '负责人', exact: true }), page, '采购甲');
  await fillDate(form.getByLabel('截止日', { exact: true }), weekStart);
  await form.getByLabel('完成标准或要核对的依据', { exact: true }).fill(criteria);
  await form.getByRole('button', { name: /^保\s*存$/ }).click();
  const record = page.getByRole('row').filter({ hasText: decision });
  await record.getByText('待完成', { exact: true }).waitFor();
  await record.getByText(criteria, { exact: true }).waitFor();
  const generate = page.getByRole('button', { name: '生成全店周报', exact: true });
  assert.equal(await generate.count(), 0, '管理周会只保存决定，生成入口归周报');
  await reports.click();
  await page.waitForURL((url) => url.pathname === '/reports' && url.searchParams.get('weekStart') === weekStart);
  await generate.waitFor();
  assert.equal(await weekInput.inputValue(), weekStart);
  const generated = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/v1/reports/weekly' && response.request().method() === 'POST');
  await generate.click();
  const response = await generated;
  assert.ok(response.ok(), '所选周的全店周报应成功生成');
  assert.deepEqual(response.request().postDataJSON(), { weekStart });
  const report: unknown = await response.json();
  assert.ok(typeof report === 'object' && report !== null && 'id' in report && typeof report.id === 'string');
  const reportPath = '/reports/' + encodeURIComponent(report.id);
  await page.getByRole('link', { name: /^打\s*开$/ }).and(page.locator(`a[href="${reportPath}"]`)).click();
  await page.waitForURL((url) => url.pathname === reportPath);
  const frozenReport = page.url();
  await record.getByText('待完成', { exact: true }).waitFor();

  await page.goto(liveMeeting);
  await record.getByRole('button', { name: '登记完成', exact: true }).click();
  const completion = page.getByRole('dialog', { name: '登记决定完成', exact: true });
  await completion.getByLabel('实际完成依据', { exact: true }).fill(evidence);
  await completion.getByRole('button', { name: /^保\s*存$/ }).click();
  const completed = record.getByText('已完成 · ' + evidence + ' · 管理层甲', { exact: true });
  await completed.waitFor();
  await page.reload();
  await completed.waitFor();
  await page.screenshot({ path: join(out, 'procurement-meeting.png'), animations: 'disabled' });
  await page.goto(frozenReport);
  await page.getByRole('heading', { name: '管理周会 · 达肤妍', exact: true }).waitFor();
  await record.getByText('待完成', { exact: true }).waitFor();
  assert.equal(await record.getByText(evidence, { exact: false }).count(), 0);
  await page.screenshot({ path: join(out, 'procurement-frozen-weekly.png'), animations: 'disabled' });
  return { store, weekStart, previousWeek, materialPo, ordered: 200_000, sourceReported: 158_000, sourceReportedGap: 42_000, decision, currentCompletion: evidence, frozenReport: new URL(frozenReport).pathname };
}

export async function checkDirectorHome({ page, buyer, lead, origin, out, materialPo, weekStart, warehouse }: Scenario & {
  readonly page: Page;
  readonly buyer: Page;
  readonly lead: Page;
  readonly materialPo: string;
  readonly weekStart: string;
  readonly warehouse: string;
}) {
  const params = new URLSearchParams({ store, weekStart });
  const source = await page.request.get(new URL(`/api/v1/dashboard/management-meeting?${params}`, origin).href);
  assert.ok(source.ok());
  const meeting: { readonly materials: readonly { readonly poRef: string | null; readonly materialLineId: string }[] } = await source.json();
  const material = meeting.materials.find(({ poRef }) => poRef === materialPo);
  assert.ok(material);
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const seeded = await buyer.request.post(new URL(`/api/v1/lines/${material.materialLineId}/batches`, origin).href, {
    data: { plannedQty: 50, receiverPartyId: warehouse, dateBuyerConfirmed: yesterday },
  });
  assert.ok(seeded.ok(), `总监首页合成逾期批次 HTTP ${seeded.status()}: ${await seeded.text()}`);

  const home = new URL('/home', origin).href;
  await page.goto(home);
  await page.getByText(/^\*数据截止 \d{4}-\d{2}-\d{2}$/u).waitFor();
  assert.equal(await page.getByRole('banner').getByText(/采购订单总表|数据截止/u).count(), 0);
  await checkDirectorRegister({ page, materialPo });
  await checkDirectorProjects(page);
  await checkDirectorViewport(page);
  await page.screenshot({ path: join(out, 'director-home.png'), animations: 'disabled' });
  const scope = page.getByRole('group', { name: '店铺范围' });
  await scope.getByRole('button', { name: '合成新品牌' }).click();
  await page.getByRole('region', { name: '新品开发进度' }).getByRole('button', { name: '合成新品牌试产项目' }).waitFor();
  await page.getByRole('group', { name: '事项概览' }).getByRole('button', { name: /进行中事项.*0 *件/ }).waitFor();
  await scope.getByRole('button', { name: otherStoreName }).click();
  await page.getByText('当前店铺没有新品排期记录', { exact: true }).waitFor();
  await scope.getByRole('button', { name: storeName }).click();
  await page.getByRole('region', { name: '员工负责事项' }).getByRole('button', { name: /第 20 名/ }).waitFor();
  await lead.goto(home);
  await lead.getByRole('region', { name: '新品开发进度' }).waitFor();
  assert.equal((await buyer.request.get(new URL('/api/v1/dashboard/director/schedule', origin).href)).status(), 403);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.getByRole('button', { name: '打开菜单', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const projectFocus = await page.getByRole('region', { name: '新品开发进度' }).getByText(/^先跟这件/u).boundingBox();
  assert.ok(projectFocus && projectFocus.y >= 0 && projectFocus.y + projectFocus.height <= 780);
  await page.screenshot({ path: join(out, 'director-home-phone.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  return { home: '/home', projectRankDrill: true, newBrand: true, phoneWidth: 320, emptyStore: otherStoreName };

}

async function checkDirectorRegister({ page, materialPo }: { readonly page: Page; readonly materialPo: string }) {
  const features = page.getByRole('navigation', { name: '可用功能' });
  await features.getByRole('link', { name: '跟进中心', exact: true }).waitFor();
  assert.equal(await features.getByRole('link', { name: /导入/ }).count(), 0);
  const metrics = page.getByRole('group', { name: '事项概览' });
  const risk = metrics.getByRole('button', { name: /^交期风险/ });
  const position = await risk.boundingBox();
  assert.ok(position && position.y < 500, '总监在首屏看到交期风险');
  await risk.click();
  const riskDrawer = page.getByRole('dialog', { name: '交期风险', exact: true });
  await riskDrawer.waitFor();
  await page.keyboard.press('Escape');
  await riskDrawer.waitFor({ state: 'hidden' });
  const table = page.getByRole('region', { name: '事项跟踪明细' });
  const scope = table.getByRole('combobox', { name: '事项范围' });
  await select(scope, page, '交期风险');
  const originalCount = await table.getByRole('status').innerText();
  const search = table.getByRole('textbox', { name: '搜索事项' });
  assert.equal(await search.count(), 0);
  const before = await scope.boundingBox();
  await table.getByRole('button', { name: '展开事项搜索' }).click();
  await search.and(page.locator(':focus')).waitFor();
  await page.waitForFunction((x) => (document.querySelector('[aria-label="事项范围"]')?.getBoundingClientRect().x ?? Infinity) < x - 16, before?.x ?? 0);
  await search.fill(materialPo);
  const first = table.getByRole('row').filter({ hasText: materialPo }).first();
  await first.getByText('已逾期', { exact: true }).waitFor();
  const product = first.getByRole('button').first();
  await product.click();
  const drawer = page.getByRole('dialog');
  await drawer.getByText('采购负责人', { exact: true }).waitFor();
  await drawer.getByRole('link', { name: '打开订单跟进记录' }).waitFor();
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await product.and(page.locator(':focus')).waitFor();
  await search.fill('不存在的合成订单');
  await table.getByText('当前条件没有匹配事项', { exact: true }).waitFor();
  await search.press('Escape');
  await table.getByRole('button', { name: '展开事项搜索' }).and(page.locator(':focus')).waitFor();
  assert.equal(await search.count(), 0);
  await table.getByRole('status').and(page.getByText(originalCount, { exact: true })).waitFor();
  await table.getByRole('columnheader', { name: /下一到货日/ }).click();
  await table.locator('th[aria-sort="ascending"]').waitFor();
}

async function checkDirectorProjects(page: Page) {
  const search = page.getByRole('button', { name: '搜索单号、品名、供应商' });
  const account = page.locator('header button[aria-expanded]').last();
  const left = await search.boundingBox();
  const right = await account.boundingBox();
  assert.ok(left && right && right.x >= left.x + left.width);
  const ranking = page.getByRole('region', { name: '员工负责事项' });
  const first = ranking.getByRole('button', { name: '第 1 名 · 项目经理 01 · 3 个项目' });
  await first.click();
  const list = page.getByRole('dialog', { name: '项目经理 01 · 负责项目' });
  await list.getByText('共 3 个项目', { exact: true }).waitFor();
  await list.getByRole('textbox', { name: '搜索负责项目' }).fill('保湿');
  await list.getByText('共 1 个项目', { exact: true }).waitFor();
  await list.getByRole('button', { name: '合成保湿面膜' }).click();
  const detail = page.getByRole('dialog', { name: '合成保湿面膜' });
  await detail.getByText('BOM表搭建情况').waitFor();
  await detail.getByText('核对样品反馈').waitFor();
  await page.keyboard.press('Escape');
  await detail.waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await list.waitFor({ state: 'hidden' });
  await ranking.getByRole('button', { name: /第 20 名/u }).click();
  await page.getByRole('dialog').getByText('共 1 个项目', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}

async function checkDirectorViewport(page: Page) {
  await page.getByRole('group', { name: '事项概览' }).getByRole('button', { name: /^进行中事项/ }).click();
  const shops = page.getByRole('group', { name: '店铺范围' });
  const cutoff = shops.getByText(/^\*数据截止/u);
  const lastBrand = shops.getByRole('button', { name: '未分店铺' });
  const dev = page.getByRole('region', { name: '新品开发进度' });
  const rank = page.getByRole('region', { name: '员工负责事项' });
  const shortcuts = page.getByRole('navigation', { name: '可用功能' });
  const details = page.getByRole('region', { name: '事项跟踪明细' });
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });
    const [brand, date, title, caption] = await Promise.all([
      lastBrand.boundingBox(), cutoff.boundingBox(),
      rank.getByText('员工负责事项', { exact: true }).boundingBox(),
      rank.getByText('按项目对接人负责的新品数量排行', { exact: true }).boundingBox(),
    ]);
    assert.ok(date && brand && date.x >= brand.x + brand.width && date.y < brand.y + brand.height && brand.y < date.y + date.height,
      `店铺筛选和截止日期应同行。宽度 ${viewport.width}，位置 ${JSON.stringify({ brand, date })}`);
    assert.ok(title && caption && caption.x >= title.x + title.width && caption.y < title.y + title.height && title.y < caption.y + caption.height,
      `排行口径应在标题右侧。宽度 ${viewport.width}，位置 ${JSON.stringify({ title, caption })}`);
    const [navigation, projects, tracking, staff] = await Promise.all([
      shortcuts.boundingBox(),
      ...[dev, details, rank].map((panel) => panel.locator('.ant-card').first().boundingBox()),
    ]);
    assert.ok(navigation && projects && tracking && staff);
    assert.ok(Math.abs(navigation.y - projects.y) < 1, '首页两列顶部对齐');
    assert.ok(Math.abs(tracking.y + tracking.height - staff.y - staff.height) < 1, '首页两列底部对齐');
    assert.ok(tracking.y + tracking.height <= viewport.height && staff.y + staff.height <= viewport.height, '首页卡片在桌面首屏完整可见');
  }
  await dev.getByRole('button', { name: '月份待确认 · 2 个产品' }).click();
  const drawer = page.getByRole('dialog', { name: '月份待确认' });
  await drawer.getByText('共 2 个项目').waitFor();
  await drawer.getByRole('button', { name: 'BOM 表 · 已完成 2 个' }).click();
  await drawer.getByRole('button', { name: '合成排期产品 24' }).click();
  await page.getByRole('dialog', { name: '合成排期产品 24' }).getByText('待分配', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '合成排期产品 24' }).waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
}

async function seedDevelopment(page: Page, origin: URL, resource: 'projects' | 'nodes', data: object) {
  const response = await page.request.post(new URL('/api/v1/product-development/' + resource, origin).href, { data });
  assert.ok(response.ok(), '合成新品 ' + resource + ' HTTP ' + response.status());
}

async function select(combobox: Locator, page: Page, name: string | RegExp) {
  await combobox.click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option')
    .getByText(name, { exact: true }).click();
}

async function fillDate(input: Locator, date: string) {
  await input.fill(date);
  await input.press('Enter');
}

export async function checkOrderLineNote({ page, manager, origin, out }: Scenario & { readonly page: Page; readonly manager: Page }) {
  const progress = new URL(`/progress?store=${store}&drill=stage%3Ano_batch`, origin);
  await page.goto(progress.href);
  const current = page.getByRole('region', { name: '当前进度表', exact: true });
  const row = current.getByRole('row').filter({ has: page.getByRole('link', { name: finishedName, exact: true }) });
  const product = row.getByRole('link', { name: finishedName, exact: true });
  const detail = row.getByRole('link', { name: '查看订单行详情', exact: true });
  await detail.waitFor();
  const order = new URL(await detail.getAttribute('href') ?? '', origin);
  const lineId = decodeURIComponent(order.pathname.split('/').at(-1) ?? '');
  const returnToProgress = new URL(progress.href);
  returnToProgress.searchParams.set('focusLine', lineId);
  assert.equal(order.searchParams.get('store'), store);
  const line = await page.request.get(new URL('/api/v1' + order.pathname, origin).href);
  assert.ok(line.ok());
  assert.deepEqual((await line.json()).batches, []);

  const oldNote = '旧的订单行备注';
  const newNote = '合成成品最新备注';
  const followUps = new URL('/api/v1/follow-ups', origin);
  const old = await page.request.post(followUps.href, { data: { orderLineId: lineId, kind: 'note', text: oldNote } });
  assert.ok(old.ok());
  await page.reload();
  await row.getByText(oldNote, { exact: true }).waitFor();
  assert.equal(await current.getByRole('textbox').count(), 0);
  await detail.click();
  await page.waitForURL(order.href);
  const note = page.getByRole('region', { name: '订单行备注', exact: true });
  await note.getByText(oldNote, { exact: true }).waitFor();
  const textbox = note.getByRole('textbox', { name: '订单行备注', exact: true });
  await textbox.fill(newNote);
  assert.deepEqual(await recordOrderFollowUp(page, note.getByRole('button', { name: '保存备注', exact: true })), {
    orderLineId: lineId, kind: 'note', text: newNote,
  });
  await note.getByText(newNote, { exact: true }).waitFor();
  await page.getByRole('link', { name: '返回管理店铺', exact: true }).click();
  await page.waitForURL(returnToProgress.href);
  await row.getByText(newNote, { exact: true }).waitFor();
  await product.and(page.locator('a:focus')).waitFor();
  assert.equal(await row.getByText(oldNote, { exact: true }).count(), 0);

  await page.setViewportSize({ width: 320, height: 800 });
  const mobileProduct = page.getByRole('link', { name: `${finishedPo} ${finishedName}`, exact: true });
  const mobileRow = current.getByRole('row').filter({ has: mobileProduct });
  await mobileRow.getByRole('button', { name: '展开行', exact: true }).click();
  await current.getByText(newNote, { exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await current.getByRole('textbox').count(), 0);
  await page.screenshot({ path: join(out, 'order-line-note-mobile.png'), animations: 'disabled' });
  await mobileProduct.click();
  await page.waitForURL(order.href);
  await note.getByText(newNote, { exact: true }).waitFor();
  await textbox.fill('这条草稿属于成品');
  const material = page.getByRole('region', { name: '关联采购事项', exact: true }).locator('a[href^="/lines/"]').first();
  const materialUrl = new URL(await material.getAttribute('href') ?? '', origin);
  assert.ok(materialUrl.pathname.startsWith('/lines/') && materialUrl.pathname !== order.pathname);
  const materialId = decodeURIComponent(materialUrl.pathname.split('/').at(-1) ?? '');
  await material.click();
  await page.waitForURL(materialUrl.href);
  await page.getByText('订单行 ' + materialId, { exact: false }).waitFor();
  await textbox.waitFor();
  assert.equal(await textbox.inputValue(), '', '切换到物料后不应带入成品订单行的草稿');
  await page.getByRole('link', { name: '返回管理店铺', exact: true }).click();
  await page.waitForURL(returnToProgress.href);
  await page.setViewportSize({ width: 1440, height: 900 });

  await manager.goto(progress.href);
  const managerRow = manager.getByRole('region', { name: '当前进度表', exact: true }).getByRole('row').filter({ hasText: finishedName });
  await managerRow.getByRole('link', { name: finishedName, exact: true }).waitFor();
  assert.equal(await managerRow.getByText(newNote, { exact: true }).count(), 0);
  await managerRow.getByRole('link', { name: finishedName, exact: true }).click();
  await manager.getByText(newNote, { exact: true }).waitFor();
  await manager.getByText(oldNote, { exact: true }).waitFor();
  assert.equal(await manager.getByRole('button', { name: '保存备注', exact: true }).count(), 0);
  const denied = await manager.request.post(followUps.href, { data: { orderLineId: lineId, kind: 'note', text: '管理账号不可写' } });
  assert.equal(denied.status(), 403);

  const batchedLineId = 'hz09-line-250';
  const batchId = 'hz09-batch-250';
  const batchedOrder = new URL(`/lines/${batchedLineId}?focusBatch=${batchId}`, origin);
  await page.goto(batchedOrder.href);
  const promise = '合成批次工厂承诺';
  await page.getByRole('textbox', { name: '工厂承诺', exact: true }).fill(promise);
  assert.deepEqual(await recordOrderFollowUp(page, page.getByRole('button', { name: '记工厂承诺', exact: true })), {
    orderLineId: batchedLineId, batchId, kind: 'promise', text: promise,
  });
  await page.getByText(promise, { exact: true }).waitFor();
  await note.getByText('暂无订单行备注', { exact: true }).waitFor();
  const batchedLineNote = '整笔合成订单等待确认';
  await textbox.fill(batchedLineNote);
  await recordOrderFollowUp(page, note.getByRole('button', { name: '保存备注', exact: true }));
  await note.getByText(batchedLineNote, { exact: true }).waitFor();

  const batchNote = '合成批次等待承运回复';
  await page.goto(new URL(`/today?drawer=batch%3A${batchId}&draft=note`, origin).href);
  const followUp = page.getByRole('dialog', { name: '记跟进', exact: true });
  await followUp.getByText(/合成待催 250/).first().waitFor();
  await select(followUp.getByRole('combobox', { name: '类型', exact: true }), page, '备注');
  await followUp.getByLabel('内容', { exact: true }).fill(batchNote);
  assert.deepEqual(await recordOrderFollowUp(page, followUp.getByRole('button', { name: /^确\s*认$/ })), {
    orderLineId: batchedLineId, batchId, kind: 'note', text: batchNote,
  });
  await page.goto(batchedOrder.href);
  await note.getByText(batchedLineNote, { exact: true }).waitFor();
  await page.getByRole('listitem').filter({ hasText: batchNote }).waitFor();
  return { po: finishedPo, initialBatches: 0, oldNote, newNote, mobile: true, restoredFilter: progress.search, isolatedDraft: true, managerWrite: denied.status(), promise, batchedLineNote, batchNote };
}

async function recordOrderFollowUp(page: Page, button: Locator): Promise<unknown> {
  const [saved] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/follow-ups' && response.request().method() === 'POST'),
    button.click(),
  ]);
  assert.equal(saved.status(), 200);
  return saved.request().postDataJSON();
}
