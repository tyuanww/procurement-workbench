import { expect, it } from 'vitest';
import type { ProductDevelopment, ProductDevelopmentNode } from '../../packages/contracts/src/index.js';
import { entityId, localDate, orderLineId } from '../../packages/domain/src/index.js';
import { emptyScheduleFilters, scheduleWindow } from '../../apps/web/src/features/progress/index.js';
import type { WorkItem } from '../../apps/web/src/features/today/index.js';
import { planningGroups } from '../../apps/web/src/pages/progress/planning-rows.js';
import { lineDetailBack, orderScheduleAddress } from '../../apps/web/src/pages/lines/detail/desk-navigation.js';

const monday = localDate('2026-12-07');
const tuesday = localDate('2026-12-08');
const wednesday = localDate('2026-12-09');
const friday = localDate('2026-12-11');
const window = scheduleWindow({ scale: 'week', anchor: monday });
const order = orderLineId('formal-order');
const unrelatedOrder = orderLineId('another-order');
const project = entityId('dev-project');
const userId = entityId('lead');
const batch = {
  id: 'batch-1', seq: 1, supplierPromisedOn: tuesday, buyerConfirmedOn: wednesday, plannedQty: 100, status: 'partially_received',
  fulfillment: { unit: '件', unshippedQty: 50, inTransitQty: 0, receivedQty: 50, verifiedShippedQty: 50, verifiedReceivedQty: 50,
    overShippedQty: 0, overReceivedQty: 0, receiptWithoutShipmentQty: 0, reviewCount: 0 },
  reportedShipments: [{ reportedOn: tuesday, quantity: 50, unit: '件', evidence: '待核报发' }],
} satisfies ProductDevelopmentNode['batches'][number];

const node: ProductDevelopmentNode = {
  id: entityId('dev-node'), projectId: project, title: '首批成品入仓', destination: 'finished_to_warehouse',
  ownerUserId: userId, buyerUserId: null, plannedStart: monday, plannedEnd: tuesday, ownerName: '主责甲', buyerName: null,
  canReply: false, status: 'in_progress', version: 1, daysUntilRequired: 1, latestReply: null, replies: [],
  formalLink: { orderLineId: order, procurementLineId: order, oaRef: 'XPKA(CN)9901' }, batches: [batch],
};

function development(entry: ProductDevelopmentNode): ProductDevelopment {
  return { businessDate: monday, canCreateProject: false, users: [], projects: [{
    id: project, store: 'dafuyan', title: '合成修护霜', productLeadUserId: userId, productLeadName: '主责甲',
    createdBy: userId, createdAt: '2026-12-01', canManage: false, nodes: [entry],
  }] };
}

function task(id: string, line: WorkItem['subjectId']): WorkItem {
  return {
    id, subjectType: 'order_line', subjectId: line, kind: 'task', title: '生产', ownerUserId: null, ownerName: null,
    counterpartyPartyId: null, counterpartyRole: null, counterpartyName: null, plannedStart: monday, plannedEnd: tuesday,
    status: 'planned', priority: 'normal', source: 'manual', parentId: null, version: 1, overdueDays: null, orderLine: null, batch: null,
    supplierPartyId: null, supplierName: null, factoryPartyId: null, factoryName: null,
  };
}

function projectRows(overrides: Partial<Parameters<typeof planningGroups>[0]> = {}) {
  return planningGroups({ scope: 'all', items: [task('linked-task', order), task('unlinked-task', unrelatedOrder)],
    development: development(node), orders: [], selectedBatches: [], window, today: monday,
    filters: emptyScheduleFilters(), query: '', conflicts: {}, ...overrides });
}

it('用正式 OA 关联组织同一结果，查询匹配关联的节点、任务和批次', () => {
  const groups = projectRows({ query: 'xpka(cn)9901' });
  expect(groups).toHaveLength(1);
  expect(groups[0]?.rows.map((row) => [row.source.kind, row.title])).toEqual([
    ['development', '首批成品入仓'], ['task', '生产'], ['batch', '要货批次 1'],
  ]);
  expect(projectRows().map((group) => group.rows.map((row) => row.id))).toEqual([
    [`development:${project}:${node.id}`, 'task:linked-task', 'batch:batch-1'], ['task:unlinked-task'],
  ]);
});

it('项目要求、采购确认和已核实实收使用各自日期，不把报发日期或汇总数量画成实际收货点', () => {
  const groups = projectRows();
  expect(groups[0]?.rows.find((row) => row.source.kind === 'development')?.points).toEqual([{ kind: 'requirement', date: tuesday }]);
  expect(groups[0]?.rows.find((row) => row.source.kind === 'batch')?.points).toEqual([{ kind: 'confirmed', date: wednesday }]);
  const later = localDate('2026-12-15');
  const actual = projectRows({ development: development({ ...node, batches: [{ ...batch, receiptDates: [friday, later] }] }) });
  const receipt = actual[0]?.rows.find((row) => row.source.kind === 'batch');
  expect(receipt?.points).toEqual([{ kind: 'confirmed', date: wednesday }, { kind: 'received', date: friday }]);
  expect(receipt?.meta).toContain('确认实收 50 / 100 件');
  expect(receipt?.status.label).toBe('部分收货');
});

it('从正式订单行恢复新品入口和排期查询', () => {
  const source = 'planScope=development&planSearch=9901&from=2026-12-07&developmentProject=dev-project&developmentNode=dev-node';
  const back = (schedule: string) => lineDetailBack({ progress: null, schedule, state: null, lineId: 'line-1' });
  expect(back(`planEntry=development&${source}`)).toEqual({ to: `/progress/development?${source}`, label: '返回新品开发' });
  expect(back(`view=development&planEntry=alias&${source}`)).toEqual({ to: `/progress?view=development&${source}`, label: '返回新品开发' });
  expect(back('planEntry=development&planScope=all')?.label).toBe('返回订单与任务排期');
  expect(back('scheduleLine=old-link')?.to).toBe('/progress/schedule?scheduleLine=old-link');
});

it('订单详情区分旧排期和当前进度返回，并保留重新打开排期时的筛选', () => {
  const legacy = (progress: string) => lineDetailBack({ progress, state: null, lineId: 'line-1' });
  expect(legacy('store=dafuyan&scope=mine')).toEqual({ to: '/progress/current?store=dafuyan&scope=mine', label: '返回当前进度' });
  expect(legacy('view=schedule&scheduleLine=line-1&from=2026-11-09')?.to).toBe('/progress/schedule?view=schedule&scheduleLine=line-1&from=2026-11-09');
  const params = new URLSearchParams({
    backToSchedule: 'planEntry=development&planScope=development&scale=month&from=2026-11-09&planSearch=原筛选&developmentNode=old-node',
    store: 'dafuyan',
  });
  const target = new URL(orderScheduleAddress({ params, lineId: 'line-1' }), 'http://test.local');
  expect(target.pathname).toBe('/progress/schedule');
  expect(Object.fromEntries(target.searchParams)).toEqual({ scale: 'month', from: '2026-11-09', planSearch: '原筛选', store: 'dafuyan', scheduleLine: 'line-1' });
});
