import { expect, it } from 'vitest';
import type { AuthProvider } from '../../packages/auth/src/index.js';
import { buildHttpApp } from '../../apps/server/src/http/app.js';
import { registerPlanRoutes } from '../../apps/server/src/http/plan/routes.js';
import type { PlanApi } from '../../apps/server/src/http/plan/api.js';
import type { DailyPlanView, ScheduleView, WorkItemDetailView, WorkItemView } from '../../packages/application/src/plan/views.js';
import { entityId } from '../../packages/domain/src/values/ids.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';

const WORK_ITEM_ID = 'work-item-1';
const CALLS: string[] = [];

const item: WorkItemView = {
  id: WORK_ITEM_ID,
  subjectType: 'standalone',
  subjectId: null,
  kind: 'task',
  title: '写单',
  ownerUserId: 'buyer-1',
  ownerName: '采购甲',
  counterpartyPartyId: null,
  counterpartyRole: null,
  counterpartyName: null,
  plannedStart: localDate('2026-11-09'),
  plannedEnd: localDate('2026-11-09'),
  status: 'planned',
  priority: 'normal',
  source: 'manual',
  parentId: null,
  version: 0,
  overdueDays: null,
  orderLine: null,
  batch: null,
  supplierPartyId: null,
  supplierName: null,
  factoryPartyId: null,
  factoryName: null,
};

const daily: DailyPlanView = { date: localDate('2026-11-09'), asOf: localDate('2026-11-09'), total: 1, overdueCount: 0, items: [item], byOwner: [{ key: 'buyer-1', label: '采购甲', items: [item] }], bySupplier: [], byFactory: [] };
const schedule: ScheduleView = { from: localDate('2026-11-09'), to: localDate('2026-11-15'), total: 1, items: [item] };
const detail: WorkItemDetailView = { item, events: [], dependenciesOut: [], dependenciesIn: [] };

const api: PlanApi = {
  createWorkItem: async (input) => { CALLS.push(`create:${input.title}`); return { workItemId: entityId(WORK_ITEM_ID) }; },
  updateWorkItem: async () => ({ workItemId: entityId(WORK_ITEM_ID), version: 1 }),
  changeStatus: async (input) => { CALLS.push(`status:${input.status}`); return { workItemId: entityId(WORK_ITEM_ID), version: 2 }; },
  addDependency: async () => ({ dependencyId: entityId('dep-1'), created: true }),
  buildProcurementSchedule: async () => ({ workItemIds: [entityId(WORK_ITEM_ID)], created: true }),
  generate: async (input) => { CALLS.push(`generate:${String(input.batchIds?.length ?? 0)}`); return { created: 0, skipped: 0 }; },
  daily: async (input) => { CALLS.push(`daily:${input.date}`); return daily; },
  schedule: async () => schedule,
  progress: async () => ({ from: localDate('2026-11-09'), to: localDate('2026-11-15'), total: 1, done: 0, overdue: 0, blocked: 0, completionRate: 0, byOwner: [], bySupplier: [], byFactory: [] }),
  list: async () => ({ items: [item], page: { page: 1, pageSize: 50, total: 1 } }),
  get: async () => detail,
};

const auth: AuthProvider = {
  mode: 'dev',
  registerRoutes: () => undefined,
  resolve: async () => ({ id: entityId('buyer-1'), name: '采购甲', roles: ['buyer'] }),
};

const anonymous: AuthProvider = { mode: 'dev', registerRoutes: () => undefined, resolve: async () => undefined };

async function server(provider: AuthProvider = auth) {
  return buildHttpApp({ auth: provider, register: (app) => { registerPlanRoutes(app, api); } });
}

it('每日计划路由解析业务日期并返回 wire 过的 JSON', async () => {
  CALLS.length = 0;
  const app = await server();
  const response = await app.inject({ method: 'GET', url: '/api/v1/plan/daily?date=2026-11-09' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ total: 1, date: '2026-11-09', items: [{ id: WORK_ITEM_ID }] });
  expect(CALLS).toEqual(['daily:2026-11-09']);
  await app.close();
});

it('缺少日期或星期区间时返回 VALIDATION_FAILED', async () => {
  const app = await server();
  const daily = await app.inject({ method: 'GET', url: '/api/v1/plan/daily' });
  expect(daily.statusCode).toBe(400);
  expect(daily.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  const schedule = await app.inject({ method: 'GET', url: '/api/v1/plan/schedule?from=2026-11-09' });
  expect(schedule.statusCode).toBe(400);
  await app.close();
});

it('总排期路由返回时间轴', async () => {
  const app = await server();
  const response = await app.inject({ method: 'GET', url: '/api/v1/plan/schedule?from=2026-11-09&to=2026-11-15' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ from: '2026-11-09', to: '2026-11-15', total: 1 });
  await app.close();
});

it('创建、改状态和生成里程碑走对应路由', async () => {
  CALLS.length = 0;
  const app = await server();
  const created = await app.inject({ method: 'POST', url: '/api/v1/plan/work-items', payload: { subjectType: 'standalone', kind: 'task', title: '写单', plannedStart: '2026-11-09', plannedEnd: '2026-11-10' } });
  expect(created.statusCode).toBe(200);
  expect(created.json()).toEqual({ workItemId: WORK_ITEM_ID });
  const status = await app.inject({ method: 'POST', url: `/api/v1/plan/work-items/${WORK_ITEM_ID}/status`, payload: { status: 'in_progress' } });
  expect(status.statusCode).toBe(200);
  expect(status.json()).toEqual({ workItemId: WORK_ITEM_ID, version: 2 });
  const generated = await app.inject({ method: 'POST', url: '/api/v1/plan/generate', payload: { batchIds: [WORK_ITEM_ID] } });
  expect(generated.statusCode).toBe(200);
  expect(generated.json()).toEqual({ created: 0, skipped: 0 });
  expect(CALLS).toEqual(['create:写单', 'status:in_progress', 'generate:1']);
  await app.close();
});

it('非法状态和非法日期返回 400，未登录返回 401', async () => {
  const app = await server();
  const badStatus = await app.inject({ method: 'POST', url: `/api/v1/plan/work-items/${WORK_ITEM_ID}/status`, payload: { status: 'finished' } });
  expect(badStatus.statusCode).toBe(400);
  const badDates = await app.inject({ method: 'POST', url: '/api/v1/plan/work-items', payload: { subjectType: 'standalone', kind: 'task', title: '写单', plannedStart: '2026-13-01', plannedEnd: '2026-11-10' } });
  expect(badDates.statusCode).toBe(400);
  await app.close();
  const anonymousApp = await server(anonymous);
  const unauthorized = await anonymousApp.inject({ method: 'GET', url: '/api/v1/plan/daily?date=2026-11-09' });
  expect(unauthorized.statusCode).toBe(401);
  await anonymousApp.close();
});

it('详情和列表路由返回 wire 过的结构', async () => {
  const app = await server();
  const itemResponse = await app.inject({ method: 'GET', url: `/api/v1/plan/work-items/${WORK_ITEM_ID}` });
  expect(itemResponse.statusCode).toBe(200);
  expect(itemResponse.json()).toMatchObject({ item: { id: WORK_ITEM_ID }, events: [], dependenciesIn: [] });
  const listResponse = await app.inject({ method: 'GET', url: '/api/v1/plan/work-items?includeClosed=true&page=1&pageSize=20' });
  expect(listResponse.statusCode).toBe(200);
  expect(listResponse.json()).toMatchObject({ items: [{ id: WORK_ITEM_ID }], page: { page: 1, pageSize: 50, total: 1 } });
  await app.close();
});
