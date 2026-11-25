import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
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
  await progressStages.getByRole('button', { name: /^待建批次 / }).click();
  await manager.waitForURL((url) => url.searchParams.get('drill') === 'stage:no_batch');
  await select(stay, manager, '15+ 天');
  await manager.waitForURL((url) => url.searchParams.get('stay') === '15+' && url.searchParams.get('drill') === 'stage:no_batch');
  const clear = filters.getByRole('button', { name: '清除下钻' });
  await clear.press('Enter');
  await manager.waitForURL((url) => !url.searchParams.has('drill') && url.searchParams.get('stay') === '15+');
  assert.equal(await clear.evaluate((button) => button === document.activeElement), true);
  await select(stay, manager, '全部停留天数');
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
  await page.getByText('本月排期', { exact: true }).waitFor();
  await page.getByText('4 条 · 按负责人分组', { exact: true }).waitFor();
  await page.screenshot({ path: join(out, 'procurement-schedule.png'), animations: 'disabled' });
  await page.goto(new URL('/today', origin).href);
  await (await sidebarLink(page.locator('aside'), '今日事项', '今日排期')).click();
  await page.getByRole('button', { name: /^下单\s/ }).press('Enter');
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
  const followUp = page.getByRole('dialog', { name: '合成待催 250', exact: true });
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
