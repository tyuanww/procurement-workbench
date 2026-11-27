// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { entityId, localDate, type Role } from '../../packages/domain/src/index.js';
import { AppRoutes } from '../../apps/web/src/app/routes.js';
import { lineDetailBack } from '../../apps/web/src/pages/lines/detail/desk-navigation.js';
import { scheduleReturnPath, scheduleRiskEntry } from '../../apps/web/src/features/progress/index.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, button, calls, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, useHostSearch, waitFor } from './party-preview-dom.js';

const task = {
  id: 'procurement-schedule:materials:line-1', title: '样本 · 齐料阻塞', status: 'blocked',
  subjectType: 'delivery_batch', subjectId: 'batch-1', kind: 'task',
  ownerUserId: 'owner-1', ownerName: '负责人甲', counterpartyPartyId: null, counterpartyRole: null, counterpartyName: null,
  plannedStart: '2026-11-07', plannedEnd: '2026-11-09', priority: 'normal', source: 'manual',
  parentId: null, version: 2, overdueDays: 2,
  orderLine: { id: 'line-1', poRaw: 'PO-X', nameRaw: '样本', itemCodeRaw: null, supplierPartyId: 'supplier-1' },
  batch: { id: 'batch-1', seq: 1, orderLineId: 'line-1' },
  supplierPartyId: 'supplier-1', supplierName: '供应商甲', factoryPartyId: 'factory-1', factoryName: '工厂甲',
};
const counts = { total: 1, done: 0, overdue: 1, blocked: 1, completionRate: 0 };
const project = {
  from: '2026-11-05', to: '2026-11-15', ...counts,
  byOwner: [{ key: 'owner-1', label: '负责人甲', ...counts, itemIds: [task.id] }],
  bySupplier: [{ key: 'supplier-1', label: '供应商甲', ...counts, itemIds: [task.id] }],
  byFactory: [{ key: 'factory-1', label: '工厂甲', ...counts, itemIds: [task.id] }],
  details: { asOf: '2026-11-11', tasks: [{ item: task, overdue: true }] },
};
const riskUrl = '/api/v1/plan/progress?from=2026-11-05&to=2026-11-15&includeItems=true';
const originalTaskUrl = '/api/v1/plan/work-items/' + encodeURIComponent(task.id);
let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  await act(() => mounted?.unmount());
  mounted = undefined;
  emptyReads();
  resetDom();
});

it('管理看板原入口使用指定日期，下钻同一任务只读详情，返回原分组', async () => {
  open('/dashboard?view=project&from=2026-11-05&to=2026-11-15&dimension=owner&lane=material', ['manager', 'buyer']);
  await waitFor(() => calls.some(({ url }) => url === riskUrl));
  await act(() => fulfill({ urlPart: riskUrl, status: 200, body: project }));
  expect(document.title).toContain('排期任务进度');
  click(button('查看负责人 负责人甲的任务'));
  const link = findLink(task.title);
  const target = new URL(link.href).searchParams;
  expect(target.get('taskMode')).toBe('read');
  expect(new URLSearchParams(target.get('riskReturn') ?? '').get('lane')).toBe('material');
  click(link);
  const taskUrl = '/api/v1/plan/work-items/' + encodeURIComponent(task.id);
  await waitFor(() => calls.some(({ url }) => url === taskUrl));
  await act(() => fulfill({ urlPart: taskUrl, status: 200, body: { item: task, events: [], dependenciesIn: [], dependenciesOut: [] } }));
  const modal = document.querySelector('[role="dialog"]');
  expect(modal?.textContent).toContain('阻塞');
  expect(modal?.textContent).toContain('PO-X');
  expect(modal?.textContent).not.toContain('取消任务');
  expect(modal?.querySelector('[aria-label="更改任务状态"]')).toBeNull();
  const order = new URL(findLink('打开订单行').href);
  expect(order.pathname).toBe('/lines/line-1');
  expect(order.searchParams.get('focusBatch')).toBe('batch-1');
  expect(order.searchParams.get('store')).toBe('all');
  expect(new URLSearchParams(order.searchParams.get('backToSchedule') ?? '').get('drawer')).toBe(`task:${task.id}`);
  expect(findLink('返回排期任务进度').href).toContain('lane=material');
  click(button('关闭'));
  await waitFor(() => calls.some(({ url }) => url === riskUrl));
  await act(() => fulfill({ urlPart: riskUrl, status: 200, body: project }));
  await waitFor(() => findOptionalLink(task.title) !== undefined);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('负责人 · 负责人甲');
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('2026-11-05 至 2026-11-15');
});

it('排期筛选用于指标、分组和详情，并可经前置任务分层返回', async () => {
  const prior = { ...task, id: 'prior-1', title: '样本 · 核对剩余备货', plannedEnd: '2026-11-08' };
  const differentStatus = { ...task, id: 'done-1', title: '样本 · 已完成齐料', status: 'done' };
  const differentOwner = { ...task, id: 'other-owner', title: '样本 · 另一负责人齐料', ownerUserId: 'owner-2', ownerName: '负责人乙' };
  const differentStore = { ...task, id: 'other-store', title: '样本 · 另一店铺齐料' };
  const differentKeyword = { ...task, id: 'different-keyword', title: '样本 · 交接物料' };
  const all = [task, prior, differentStatus, differentOwner, differentStore, differentKeyword];
  const inStore = all.filter((item) => item !== differentStore);
  const fullCounts = { total: 6, done: 1, overdue: 5, blocked: 5, completionRate: 1 / 6 };
  const fullProject = {
    ...project, ...fullCounts,
    byOwner: [
      { ...project.byOwner[0], ...fullCounts, itemIds: all.filter((item) => item !== differentOwner).map(({ id }) => id) },
      { ...project.byOwner[0], key: 'owner-2', label: '负责人乙', itemIds: [differentOwner.id] },
    ],
    bySupplier: [{ ...project.bySupplier[0], ...fullCounts, itemIds: all.map(({ id }) => id) }],
    byFactory: [{ ...project.byFactory[0], ...fullCounts, itemIds: all.map(({ id }) => id) }],
    details: { ...project.details, tasks: all.map((item) => ({ item, overdue: item !== differentStatus })) },
  };
  const workspace = new URLSearchParams({ view: 'schedule', store: 'dafuyan', planDisplay: 'list', from: '2026-11-05',
    status: 'blocked', ownerUserId: 'owner-1', supplierPartyId: 'supplier-1', factoryPartyId: 'factory-1', planSearch: '齐料' });
  open(scheduleRiskEntry({ pathname: '/progress', search: workspace, from: project.from, to: project.to }), ['manager']);
  const storeUrl = '/api/v1/plan/schedule?from=2026-11-05&to=2026-11-15&store=dafuyan&includeClosed=true';
  const ordersUrl = '/api/v1/lines?lane=finished&store=dafuyan&page=1&pageSize=200';
  const developmentUrl = '/api/v1/product-development?store=all&includeReceiptDates=1';
  const satisfyScope = async () => {
    await waitFor(() => [riskUrl, storeUrl, ordersUrl, developmentUrl].every((url) => calls.some(({ url: request }) => request === url)));
    await act(() => {
      fulfill({ urlPart: riskUrl, status: 200, body: fullProject });
      fulfill({ urlPart: storeUrl, status: 200, body: { from: project.from, to: project.to, total: inStore.length, items: inStore, dependencyConflicts: {} } });
      fulfill({ urlPart: ordersUrl, status: 200, body: { items: [], page: { page: 1, pageSize: 200, total: 0 } } });
      fulfill({ urlPart: developmentUrl, status: 200, body: { businessDate: project.details.asOf, canCreateProject: false, users: [], projects: [] } });
    });
  };
  await satisfyScope();
  const scope = '2026-11-05 至 2026-11-15 · 达肤妍 · 状态 阻塞 · 负责人 负责人甲 · 供应商 供应商甲 · 工厂 工厂甲 · 搜索「齐料」';
  expect(document.body.textContent).toContain(scope);
  expect(document.querySelector('[aria-label="排期任务进度指标"]')?.textContent).toContain('任务总数1');
  expect(document.body.textContent).not.toContain('负责人乙');
  click(button('查看负责人 负责人甲的任务'));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(`${scope} · 1 条任务`);
  expect(findOptionalLink(differentStore.title)).toBeUndefined();
  expect(findOptionalLink(differentKeyword.title)).toBeUndefined();
  click(findLink(task.title));
  const dependency = { id: 'dependency-1', kind: 'finish_to_start', fromItemId: prior.id, toItemId: task.id, createdAt: '2026-11-08T00:00:00Z',
    predecessor: { id: prior.id, title: prior.title, plannedEnd: prior.plannedEnd, status: prior.status } };
  const resolveOriginal = async () => {
    await waitFor(() => calls.some(({ url }) => url === originalTaskUrl));
    await act(() => fulfill({ urlPart: originalTaskUrl, status: 200, body: { item: task, events: [], dependenciesIn: [dependency], dependenciesOut: [] } }));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(task.title);
  };
  await resolveOriginal();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('依赖冲突');
  click(findLink(prior.title));
  const priorUrl = '/api/v1/plan/work-items/' + prior.id;
  await waitFor(() => calls.some(({ url }) => url === priorUrl));
  await act(() => fulfill({ urlPart: priorUrl, status: 200, body: { item: prior, events: [], dependenciesIn: [], dependenciesOut: [] } }));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(prior.title);
  expect(document.querySelector('[aria-label="更改任务状态"]')).toBeNull();
  click(findLink('返回上一项任务'));
  await resolveOriginal();
  click(findLink('返回排期任务进度'));
  await satisfyScope();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('负责人 · 负责人甲');
  expect(findLink('返回订单与任务排期').pathname).toBe('/progress');
  expect(findLink('返回订单与任务排期').search).toBe(`?${workspace}`);
});

it('默认报告周期和第 2 页分组一起进入返回地址，任务组仍位于原页', async () => {
  open('/progress/schedule?lens=risk&preset=custom&dimension=owner&groupPage=2', ['manager', 'buyer']);
  await waitFor(() => calls.some(({ url }) => url.startsWith('/api/v1/plan/progress?')));
  const requestUrl = calls.find(({ url }) => url.startsWith('/api/v1/plan/progress?'))?.url;
  expect(requestUrl).toBeDefined();
  if (requestUrl === undefined) return;
  const reported = new URL(requestUrl, 'http://test.local').searchParams;
  const from = reported.get('from');
  const to = reported.get('to');
  const earlierOwners = Array.from({ length: 20 }, (_, index) => ({
    ...project.byOwner[0], key: `other-${index}`, label: `其他负责人 ${index}`,
  }));
  await act(() => fulfill({ urlPart: requestUrl, status: 200, body: {
    ...project, from, to, byOwner: [...earlierOwners, ...project.byOwner],
  } }));
  const source = riskQueryOfProbe();
  expect(source.get('preset')).toBe('recent-month');
  expect(source.get('from')).toBe(from);
  expect(source.get('to')).toBe(to);
  expect(document.body.textContent).not.toContain('其他负责人');
  click(button('查看负责人 负责人甲的任务'));
  const target = new URL(findLink(task.title).href).searchParams;
  const returned = new URLSearchParams(target.get('riskReturn') ?? '');
  expect(returned.get('groupPage')).toBe('2');
  expect(returned.get('riskGroup')).toBe('owner:owner-1');
  expect(returned.get('preset')).toBe('recent-month');
  expect(returned.get('from')).toBe(from);
  expect(returned.get('to')).toBe(to);
});

it.each([
  { projects: project, empty: false },
  { projects: { ...project, total: 0, done: 0, overdue: 0, blocked: 0, completionRate: null, byOwner: [],
    bySupplier: [], byFactory: [], details: { asOf: '2026-11-11', tasks: [] } }, empty: true },
])('按实际分组页与加载结果纠正旧查询 $empty', async ({ projects, empty }) => {
  const filters = 'lens=risk&preset=custom&from=2026-11-05&to=2026-11-15&dimension=owner&groupPage=9';
  open(`/progress/schedule?${filters}&riskGroup=owner%3Aowner-1&riskPage=8`, ['manager']);
  await waitFor(() => calls.some(({ url }) => url === riskUrl));
  await act(() => fulfill({ urlPart: riskUrl, status: 200, body: projects }));
  await waitFor(() => !riskQueryOfProbe().has('groupPage'));
  expect(riskQueryOfProbe().has('riskPage')).toBe(false);
  if (empty) {
    expect(riskQueryOfProbe().has('riskGroup')).toBe(false);
    expect(document.body.textContent).toContain('所选期间没有排期任务');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } else {
    const link = new URL(findLink(task.title).href);
    expect(new URLSearchParams(link.searchParams.get('riskReturn') ?? '').has('groupPage')).toBe(false);
  }
});

it('快速切换任务期间不会显示上一条任务的详情和订单入口', async () => {
  const second = { ...task, id: 'procurement-schedule:materials:line-2', title: '样本 · 第二条任务' };
  const params = (workItemId: string) => new URLSearchParams({ drawer: `task:${workItemId}` });
  const detailUrl = (workItemId: string) => '/api/v1/plan/work-items/' + encodeURIComponent(workItemId);
  const user = { id: entityId('user-1'), name: '排期测试', roles: ['manager', 'buyer'] as const };
  installFetch();
  installMatchMedia();
  function SwitchTask() {
    const [, setParams] = useHostSearch();
    return element('button', { onClick: () => setParams(params(second.id)), children: '切换到第二条' });
  }
  mounted = mount(memoryRouter(element('div', { children: [
    element(SwitchTask, { key: 'next' }),
    element(AppRoutes, { key: 'routes', user }),
  ] }), `/progress/schedule?${params(task.id)}`));
  await waitFor(() => calls.some(({ url }) => url === detailUrl(task.id)));
  await act(() => fulfill({ urlPart: detailUrl(task.id), status: 200, body: { item: task, events: [], dependenciesIn: [], dependenciesOut: [] } }));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(task.title);
  expect(findOptionalLink('打开订单行')).toBeDefined();
  click(button('切换到第二条'));
  await waitFor(() => calls.some(({ url }) => url === detailUrl(second.id)));
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain(task.title);
  expect(findOptionalLink('打开订单行')).toBeUndefined();
  await act(() => fulfill({ urlPart: detailUrl(second.id), status: 200, body: { item: second, events: [], dependenciesIn: [], dependenciesOut: [] } }));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(second.title);
});

it('普通采购不能通过深链读取管理视图，原总排期仍然可用', async () => {
  open('/progress/schedule?lens=risk&from=2026-11-05&to=2026-11-15&risk=blocked', ['buyer']);
  await waitFor(() => document.title.includes('无权访问'));
  expect(document.body.textContent).toContain('这个角色看不到这页。');
  expect(calls.some(({ url }) => url.includes('/api/v1/plan/'))).toBe(false);
  await act(() => mounted?.unmount());
  open('/progress/schedule?from=2026-11-05', ['buyer']);
  await waitFor(() => calls.some(({ url }) => url.startsWith('/api/v1/plan/schedule?')));
  expect(findOptionalLink('排期任务进度')).toBeUndefined();
});

it('从总排期进入管理视图后，返回保留已选店铺、刻度、日期和选中的成品订单', () => {
  const source = new URLSearchParams({
    store: 'dafuyan', scale: 'month', from: '2026-11-09', ownerUserId: 'owner-1', status: 'blocked', scheduleLine: 'line-1',
  });
  const risk = new URL(scheduleRiskEntry({ search: source, from: '2026-11-01', to: '2026-11-30' }), 'http://test.local');
  expect(risk.searchParams.get('from')).toBe('2026-11-01');
  expect(risk.searchParams.get('to')).toBe('2026-11-30');
  expect(scheduleReturnPath(risk.searchParams, { from: '2026-11-01' })).toBe(`/progress/schedule?${source}`);
  source.set('drawer', `task:${task.id}`);
  expect(lineDetailBack({ progress: null, schedule: source.toString(), state: null, lineId: 'line-1' }))
    .toEqual({ to: `/progress/schedule?${source}`, label: '返回订单与任务排期' });
});

it('风险返回保留新品地址，管理入口无来源时沿用可表示的周期', () => {
  const period = { from: localDate('2026-11-01'), to: localDate('2026-11-30') };
  const source = new URLSearchParams('planScope=orders&scale=month&from=2026-11-01');
  const risk = new URL(scheduleRiskEntry({ search: source, ...period, pathname: '/progress/development' }), 'http://test.local');
  expect(scheduleReturnPath(risk.searchParams, period)).toBe(`/progress/development?${source}`);
  expect(scheduleReturnPath(new URLSearchParams(), period)).toBe('/progress/schedule?from=2026-11-01&scale=month');
  expect(scheduleReturnPath(new URLSearchParams(), { from: period.from, to: period.from })).toBe('/progress/schedule?from=2026-11-01&scale=day');
});

function open(path: string, roles: readonly Role[]): void {
  installFetch();
  installMatchMedia();
  const user = { id: entityId('user-1'), name: '排期测试', roles };
  mounted = mount(memoryRouter(element('div', { children: [
    element(RiskQueryProbe, { key: 'probe' }),
    element(AppRoutes, { key: 'routes', user }),
  ] }), path));
}

function RiskQueryProbe() {
  const [params] = useHostSearch();
  return element('output', { hidden: true, id: 'risk-query-probe', children: params.toString() });
}

function riskQueryOfProbe() {
  return new URLSearchParams(document.getElementById('risk-query-probe')?.textContent ?? '');
}

function findOptionalLink(name: string): HTMLAnchorElement | undefined {
  return [...document.querySelectorAll('a')].find((link) => link.textContent?.trim() === name);
}

function findLink(name: string): HTMLAnchorElement {
  const link = findOptionalLink(name);
  if (link === undefined) throw new Error(`没有链接 ${name}`);
  return link;
}
