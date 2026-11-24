import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Locator, Page } from '../node_modules/.pnpm/node_modules/playwright/index.js';

const finishedPo = 'PO20261117009001';
const finishedName = '测试成品水';
const store = 'dafuyan';
const storeName = '达肤妍';
const otherStoreName = '译龄';

type Scenario = { readonly origin: URL; readonly out: string };

export async function checkStoreSchedule({ page, manager, origin, out }: Scenario & { readonly page: Page; readonly manager: Page }) {
  await manager.locator('aside').getByRole('link', { name: '管理店铺', exact: true }).click();
  const current = manager.getByRole('region', { name: '当前进度表', exact: true });
  const finished = current.getByRole('link', { name: finishedName, exact: true });
  await select(manager.getByRole('combobox', { name: '店铺', exact: true }), manager, storeName);
  await finished.waitFor();
  await select(manager.getByRole('combobox', { name: '店铺', exact: true }), manager, otherStoreName);
  await current.getByText('所选范围没有进行中的成品订单行。', { exact: true }).waitFor();
  assert.equal(await finished.count(), 0);

  await page.goto(new URL('/progress?store=' + store, origin).href);
  await page.getByRole('tab', { name: '总排期', exact: true }).click();
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
  await page.getByText('本月排期', { exact: true }).waitFor();
  await page.getByText('4 条 · 按负责人分组', { exact: true }).waitFor();
  await page.screenshot({ path: join(out, 'procurement-schedule.png'), animations: 'disabled' });
  await page.goto(new URL('/today', origin).href);
  await page.getByRole('tab', { name: '排期', exact: true }).click();
  await page.getByRole('button', { name: /^下单\s/ }).press('Enter');
  const task = page.getByRole('dialog');
  await task.getByText(finishedPo + ' · ' + finishedName, { exact: true }).waitFor();
  await task.getByRole('button', { name: /^关\s*闭$/ }).last().click();
  await task.waitFor({ state: 'hidden' });
  const totalSchedule = page.getByRole('link', { name: '查看总排期', exact: true });
  await totalSchedule.click();
  await page.waitForURL((url) => url.pathname === '/progress' && url.searchParams.get('view') === 'schedule');
  const taskContext = await checkScheduleTaskContext(page, origin);
  return { store, excludedStore: 'yiling', po: finishedPo, stages: ['下单', '齐料', '生产', '交付'], plannedDelivery: '2026-11-26', restoredScale: 'month', todayScheduleLink: true, taskContext };
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
  await page.getByRole('button', { name: new RegExp('^' + successor + '\\s') }).press('Enter');
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
  await page.goBack();
  await page.waitForURL(todayUrl);
  await scheduleLink.waitFor();
  await warning.waitFor();
  return { task: successor, predecessor, scheduleAnchor: plannedEnd, restoredTodayContext: true };
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
  await buyer.getByRole('tab', { name: '新品开发进度', exact: true }).click();
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
  await page.getByRole('tab', { name: '管理周会', exact: true }).click();
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
