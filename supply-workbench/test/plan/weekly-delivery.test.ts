import { expect, it } from 'vitest';
import { composePlan } from '../../apps/server/src/composition/plan.js';
import { buildHttpApp } from '../../apps/server/src/http/app.js';
import { registerPlanRoutes } from '../../apps/server/src/http/plan/routes.js';
import { emptyScheduleFilters } from '../../apps/web/src/features/progress/index.js';
import { orderBatchFacts, selectedPlanningBatches } from '../../apps/web/src/pages/progress/planning-batches.js';
import { hasUnambiguousWeeklyBatch } from '../../apps/web/src/pages/progress/planning-order-results.js';
import { planningGroups } from '../../apps/web/src/pages/progress/planning-rows.js';
import { weeklyDelivery } from '../../apps/web/src/pages/progress/weekly-delivery.js';
import type { DeliveryScheduleBatch, ProductDevelopment, ProductDevelopmentNode } from '../../packages/contracts/src/index.js';
import { ScheduleViewSchema } from '../../packages/contracts/src/plan-views.js';
import { entityId, localDate, orderLineId } from '../../packages/domain/src/index.js';
import type { AppHandle } from '../../packages/persistence/src/client.js';
import { followUpQueries } from '../../packages/persistence/src/queries/follow-up/index.js';
import { deliveryBatches, receipts, shipments } from '../../packages/persistence/src/schema/orders.js';
import { workItemDependencies, workItems } from '../../packages/persistence/src/schema/work-items.js';
import { AT, BUYER, TODAY, openPlanDb, seedPlanBase, wiring } from './support.js';

const SUNDAY = localDate('2026-11-15');
const scheduleUrl = `/api/v1/plan/schedule?from=${TODAY}&to=${SUNDAY}`;

it('周交付按真实批次和核实实收计数，保留遗留批次和窗外依赖，并可按指标收敛', async () => {
  const handle = await openPlanDb();
  try {
    await seedPlanBase(handle);
    await seedWeeklyDelivery(handle);
    const api = composePlan({ db: handle.db, clock: wiring(handle).clock, timeZone: 'Asia/Shanghai' });
    const app = await buildHttpApp({ auth: {
      mode: 'dev', registerRoutes: () => undefined, resolve: async (request) => request.headers['x-anonymous'] === 'true' ? undefined : BUYER,
    }, register: (server) => registerPlanRoutes(server, api) });
    try {
      expect(ScheduleViewSchema.parse((await app.inject({ url: scheduleUrl })).json()).deliveryBatches).toBeUndefined();
      const response = await app.inject({ url: `${scheduleUrl}&includeDelivery=true` });
      expect(response.statusCode).toBe(200);
      const { items, dependencyConflicts, deliveryBatches: batches = [], deliveryTasks } = ScheduleViewSchema.parse(response.json());
      expect(items).toEqual([]);
      expect(batches.map((batch) => batch.id).sort()).toEqual(['batch-1', 'batch-2', 'batch-3', 'batch-carry', 'batch-done', 'batch-next', 'batch-next-later']);
      expect(batches.find((batch) => batch.id === 'batch-done')).toMatchObject({ receiptDates: ['2026-11-10'], fulfillment: { receivedQty: 5 } });
      expect(batches.find((batch) => batch.id === 'batch-carry')).toMatchObject({ confirmed: '2026-11-05', firstConfirmed: '2026-11-03', fulfillment: { receivedQty: 0 } });
      expect(deliveryTasks).toMatchObject([{ task: { id: 'past-batch-task' }, dependencies: [{ id: 'past-predecessor' }], conflicts: [{ id: 'past-predecessor' }] }]);

      const modelInput = { batches, deliveryTasks: deliveryTasks ?? [], items, conflicts: dependencyConflicts, orders: [],
        keyword: '海葡萄', today: TODAY, window: { from: TODAY, to: SUNDAY }, filters: emptyScheduleFilters() };
      const delivery = weeklyDelivery(modelInput);
      expect(delivery.counts).toEqual({ expected: 3, outstanding: 3, nextRisk: 2 });
      const displayedRows = (model: typeof delivery) => model.groups.flatMap(({ rows }) => rows);
      expect(displayedRows(delivery).find(({ id }) => id === 'batch:batch-carry')).toMatchObject({
        recordDate: '逾期待收 4 天', points: [],
        bar: { label: '逾期待收 4 天', leftPercent: 0, widthPercent: 1 / 7 * 100, isCutStart: true },
        source: { kind: 'batch', batch: { id: 'batch-carry', orderLineId: 'line-1',
          weeklyDelivery: { timing: 'overdue', actions: [{ kind: 'expedite', qty: 5, unit: '件' }] },
          facts: { confirmed: '2026-11-05', original: '2026-11-03', conflict: null, receivedQty: 0, outstandingQty: 5, unshippedQty: 5 } } },
      });
      expect(displayedRows(delivery).find(({ id }) => id === 'batch:batch-2')).toMatchObject({
        source: { kind: 'batch', batch: {
          facts: { unit: null, receivedQty: null, outstandingQty: null, unshippedQty: null },
          weeklyDelivery: { timing: 'due-today', actions: [{ kind: 'check-receipt', reason: 'incomplete-evidence' }] },
        } },
      });
      const sample = displayedRows(delivery).find(({ id }) => id === 'batch:batch-1');
      const facts = { plannedQty: 18_000, receivedQty: 4_000, outstandingQty: 14_000, unshippedQty: 6_000, unit: '件', owner: { id: BUYER.id, name: '采购甲' },
        confirmed: '2026-11-12', original: '2026-11-10', conflict: { required: '2026-11-10', supplierPromised: '2026-11-11' } };
      const receiptAction = { kind: 'check-receipt', reason: 'checked-shipment' };
      const upcomingActions = [{ kind: 'track', by: 'check-promise' }, receiptAction];
      expect(sample).toMatchObject({ meta: 'PO-1', source: { kind: 'batch', batch: {
        facts, weeklyDelivery: { timing: 'upcoming', supplier: { name: '宜侬' }, actions: upcomingActions },
      } } });
      expect(delivery.batchActions.get('batch-1')).toMatchObject({ timing: 'upcoming', actions: upcomingActions });
      expect(delivery.batchActions.get('batch-next')).toMatchObject({ timing: 'upcoming', actions: [{ kind: 'track', by: 'confirmed-date' }] });
      const detail = await followUpQueries({ db: handle.db, clock: wiring(handle).clock, timeZone: 'Asia/Shanghai' }).getDetail(orderLineId('line-1'));
      const from = localDate('2026-11-12');
      const daily = planningGroups({ ...modelInput, scope: 'orders', development: null, query: modelInput.keyword,
        selectedBatches: selectedPlanningBatches(detail), window: { from, to: from } });
      expect(daily.flatMap(({ rows }) => rows).find(({ id }) => id === 'batch:batch-1')).toMatchObject({
        meta: '', source: { kind: 'batch', batch: { facts } }, points: [{ kind: 'confirmed', date: '2026-11-12' }],
      });
      const missingBuyer = entityId('missing-buyer');
      const needsBuyerName = selectedPlanningBatches({ ...detail, line: { ...detail.line, buyer: { id: missingBuyer, name: missingBuyer } } });
      expect(needsBuyerName.find(({ id }) => id === 'batch-1')?.facts.owner).toEqual({ id: missingBuyer, name: null });
      expect(displayedRows(delivery).find(({ id }) => id === 'batch:batch-done')).toMatchObject({
        bar: null, points: [{ kind: 'confirmed', date: '2026-11-09' }, { kind: 'received', date: '2026-11-10' }],
        source: { batch: { weeklyDelivery: { timing: 'settled', actions: [] } } },
      });
      const laterToday = weeklyDelivery({ ...modelInput, today: localDate('2026-11-12') });
      expect(displayedRows(laterToday).find(({ id }) => id === 'batch:batch-2')).toMatchObject({
        recordDate: '已过确认日 3 天', bar: { leftPercent: 1 / 7 * 100, widthPercent: 3 / 7 * 100 },
        points: [{ kind: 'confirmed', date: '2026-11-09' }],
        source: { batch: { weeklyDelivery: { timing: 'needs-review', actions: [{ kind: 'check-receipt', reason: 'incomplete-evidence' }] } } },
      });
      const futureWeek = weeklyDelivery({ ...modelInput, window: { from: localDate('2026-11-16'), to: localDate('2026-11-22') } });
      expect(displayedRows(futureWeek).find(({ id }) => id === 'batch:batch-carry')).toMatchObject({ bar: null });
      const nextWeekAfterDue = weeklyDelivery({ ...modelInput, today: localDate('2026-11-13'),
        window: { from: localDate('2026-11-16'), to: localDate('2026-11-22') } });
      expect(displayedRows(nextWeekAfterDue).find(({ id }) => id === 'batch:batch-1')).toMatchObject({
        bar: null, source: { batch: { weeklyDelivery: {
          timing: 'overdue', actions: [{ kind: 'expedite', qty: 6_000, unit: '件' }, receiptAction],
        } } },
      });
      const expected = weeklyDelivery({ ...modelInput, bucket: 'expected' });
      expect(expected.groups.flatMap((group) => group.rows.map((row) => row.id))).toEqual(['batch:batch-2', 'batch:batch-done', 'batch:batch-1']);
      const outstanding = weeklyDelivery({ ...modelInput, bucket: 'outstanding' });
      expect(outstanding.groups[0]?.title).toBe('待交批次');
      expect(outstanding.groups.flatMap((group) => group.rows.map((row) => row.id))).toEqual(['batch:batch-carry', 'batch:batch-2', 'batch:batch-1']);
      const risk = weeklyDelivery({ ...modelInput, bucket: 'nextRisk' });
      expect(risk.counts).toEqual(delivery.counts);
      expect(risk.titles.nextRisk).toBe('下周有风险');
      expect(risk.groups).toMatchObject([{ title: '风险批次', rows: [
        { id: 'batch:batch-next-later', when: expect.stringContaining('供应商承诺晚于应到') },
        { id: 'batch:batch-3', when: expect.stringContaining('采购交期待确认'),
          source: { batch: { weeklyDelivery: { timing: 'needs-review', actions: expect.arrayContaining([{ kind: 'track', by: 'confirm-date' }]) } } } },
      ] }]);
      const matching = { ...modelInput, keyword: 'PO-1', orders: [detail.line], bucket: 'outstanding' } as const;
      const groups = weeklyDelivery(matching).groups;
      const singleMatch = { groups, rows: matching.orders, keyword: matching.keyword };
      expect(hasUnambiguousWeeklyBatch(singleMatch)).toBe(true);
      expect(hasUnambiguousWeeklyBatch({ ...singleMatch, keyword: 'PO-' })).toBe(false);
      expect(hasUnambiguousWeeklyBatch({ ...singleMatch, keyword: '海葡萄' })).toBe(false);
      expect(hasUnambiguousWeeklyBatch({ ...singleMatch, groups: [] })).toBe(false);
      const otherOrder = { ...detail.line, id: 'another-order' };
      expect(hasUnambiguousWeeklyBatch({ ...singleMatch, rows: [otherOrder] })).toBe(false);
      expect(hasUnambiguousWeeklyBatch({ ...singleMatch, rows: [detail.line, otherOrder] })).toBe(false);
      const oaOnly = { ...detail.line, storeProgress: { store: 'dafuyan' as const, materials: [],
        sources: [{ oaRaw: '回查 XPKA(CN)001-2 / CGSQ002', sheetName: '进度', importBatchId: 'seed-fixture', rowNo: 1 }] } };
      expect(hasUnambiguousWeeklyBatch({ ...singleMatch, rows: [oaOnly], keyword: 'XPKA(CN)001-2' })).toBe(true);
      expect(hasUnambiguousWeeklyBatch({ ...singleMatch, rows: [oaOnly], keyword: 'XPKA(CN)001' })).toBe(false);
      const filtered = weeklyDelivery({ ...modelInput, filters: { ...modelInput.filters, ownerUserId: 'buyer-2' } });
      expect(filtered.groups).toEqual([]);
      const storeScoped = await app.inject({ url: `${scheduleUrl}&includeDelivery=true&store=dafuyan` });
      expect(ScheduleViewSchema.parse(storeScoped.json()).deliveryBatches).toEqual([]);
      const unauthorized = await app.inject({ url: `${scheduleUrl}&includeDelivery=true`, headers: { 'x-anonymous': 'true' } });
      expect(unauthorized.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  } finally {
    await handle.close();
  }
}, 30_000);

it('仅将不满足已知交期的日期并列，缺少日期或正常提前不判定为冲突', () => {
  const confirmed = localDate('2026-11-12');
  const firstConfirmed = localDate('2026-11-10');
  const earlyPromise = localDate('2026-11-11');
  const late = localDate('2026-11-13');
  const batch = { confirmed, firstConfirmed, required: late, supplierPromised: earlyPromise, plannedQty: 10, owner: null,
    fulfillment: { unit: '件', receivedQty: 11, unshippedQty: 0 } };
  expect(orderBatchFacts(batch)).toMatchObject({ original: firstConfirmed, conflict: null, outstandingQty: 0, unshippedQty: 0 });
  expect(orderBatchFacts({ ...batch, firstConfirmed: confirmed, supplierPromised: late }))
    .toMatchObject({ original: null, conflict: { required: late, supplierPromised: late } });
  expect(orderBatchFacts({ ...batch, confirmed: null, required: null }))
    .toMatchObject({ original: firstConfirmed, conflict: null });
  expect(orderBatchFacts({ ...batch, confirmed: null, required: firstConfirmed }))
    .toMatchObject({ conflict: { required: firstConfirmed, supplierPromised: earlyPromise } });
  expect(orderBatchFacts({ ...batch, owner: { id: BUYER.id, name: null } }).owner).toEqual({ id: BUYER.id, name: null });
});

it('订单日/月以订单侧排期补全批次，按采购筛选独立批次并保留新品视图口径', () => {
  const id = 'linked-batch';
  const orderId = orderLineId('linked-line');
  const confirmed = localDate('2026-11-12');
  const required = localDate('2026-11-10');
  const plannedQty = 18_000;
  const fulfillment = { unit: '件', receivedQty: 4_000, unshippedQty: 6_000, inTransitQty: 8_000, reviewCount: 0,
    verifiedShippedQty: 12_000, verifiedReceivedQty: 4_000, overShippedQty: 0, overReceivedQty: 0, receiptWithoutShipmentQty: 0 };
  const linked: ProductDevelopmentNode['batches'][number] = { id, seq: 1, buyerConfirmedOn: confirmed, supplierPromisedOn: null,
    plannedQty, status: 'partially_received', receiptDates: [confirmed], fulfillment, reportedShipments: [] };
  const order: DeliveryScheduleBatch = { id, seq: 1, orderLineId: orderId, orderName: '成品正式名称', poRaw: null, itemCode: null, oaRef: null,
    buyer: { id: BUYER.id, name: BUYER.name }, supplier: null, factory: null, confirmed, firstConfirmed: required,
    required, supplierPromised: null, receiptDates: [required], status: 'partially_received', plannedQty, fulfillment };
  const shared = { items: [], orders: [], selectedBatches: [], development: linkedDevelopment({ orderId, batch: linked }),
    today: TODAY, filters: emptyScheduleFilters(), query: '合成新品', conflicts: {} };
  const deliveryBatches = [order, { ...order, id: 'within-window-but-unlinked' }];
  const daily = planningGroups({ ...shared, scope: 'orders', deliveryBatches, window: { from: confirmed, to: confirmed } });
  expect(daily).toMatchObject([{ title: '合成新品项目', rows: [{
    id: 'batch:linked-batch', title: '要货批次 1', points: [{ kind: 'confirmed', date: confirmed }],
    source: { batch: { node: { node: { title: '出货节点' } },
      facts: { confirmed, original: required, owner: { id: BUYER.id, name: BUYER.name }, conflict: { required, supplierPromised: null }, receivedQty: 4_000 } } },
  }] }]);
  const month = { from: localDate('2026-11-01'), to: localDate('2026-11-30') };
  const byBuyer = planningGroups({ ...shared, scope: 'orders', query: '', deliveryBatches, window: month,
    filters: { ...shared.filters, ownerUserId: BUYER.id } });
  expect(byBuyer.flatMap(({ rows }) => rows).find(({ id: rowId }) => rowId === 'batch:within-window-but-unlinked'))
    .toMatchObject({ points: [{ kind: 'confirmed', date: confirmed }, { kind: 'received', date: required }] });
  const fallback = planningGroups({ ...shared, scope: 'orders', deliveryBatches: [], window: month });
  expect(fallback).toMatchObject([{ rows: [{
    source: { batch: { facts: { confirmed, original: null, owner: { id: BUYER.id, name: '关联节点采购' }, conflict: null, plannedQty: 18_000,
      receivedQty: 4_000, outstandingQty: 14_000, unshippedQty: 6_000 } } },
  }] }]);
  const product = planningGroups({ ...shared, scope: 'development', deliveryBatches, window: month });
  expect(product[0]?.rows.find(({ id: rowId }) => rowId === 'batch:linked-batch')).toMatchObject({
    meta: '关联节点采购 · 确认实收 4,000 / 18,000 件', source: { batch: { kind: 'development' } },
  });
});

it('下周仍会返回上一周缺核实凭据的账面已收批次', async () => {
  const handle = await openPlanDb();
  try {
    await seedPlanBase(handle);
    await seedWeeklyDelivery(handle);
    await handle.exec("update receipts set fulfillment = null where id = 'weekly-receipt'");
    const window = { from: localDate('2026-11-16'), to: localDate('2026-11-22') };
    const plan = composePlan({ db: handle.db, clock: { now: () => '2026-11-16T09:00:00.000Z', today: () => window.from }, timeZone: 'Asia/Shanghai' });
    const app = await buildHttpApp({ auth: {
      mode: 'dev', registerRoutes: () => undefined, resolve: async () => BUYER,
    }, register: (server) => registerPlanRoutes(server, plan) });
    try {
      const response = await app.inject({ url: `/api/v1/plan/schedule?from=${window.from}&to=${window.to}&includeDelivery=true` });
      expect(response.statusCode).toBe(200);
      const { items, dependencyConflicts, deliveryBatches = [], deliveryTasks = [] } = ScheduleViewSchema.parse(response.json());
      expect(deliveryBatches.find(({ id }) => id === 'batch-done')).toMatchObject({ status: 'received', fulfillment: { receivedQty: null } });
      const result = weeklyDelivery({ batches: deliveryBatches, deliveryTasks, orders: [], keyword: '', window, today: window.from,
        filters: emptyScheduleFilters(), conflicts: dependencyConflicts, items });
      expect(result.batchActions.get('batch-done')).toMatchObject({
        timing: 'needs-review', actions: [{ kind: 'check-receipt', reason: 'incomplete-evidence' }],
      });
    } finally {
      await app.close();
    }
  } finally {
    await handle.close();
  }
});

function linkedDevelopment({ orderId, batch }: {
  readonly orderId: ReturnType<typeof orderLineId>; readonly batch: ProductDevelopmentNode['batches'][number];
}): ProductDevelopment {
  const projectId = entityId('linked-project');
  return { businessDate: TODAY, canCreateProject: false, users: [], projects: [{
    id: projectId, store: 'dafuyan', title: '合成新品项目', productLeadUserId: BUYER.id, productLeadName: BUYER.name,
    createdBy: BUYER.id, createdAt: AT, canManage: false, nodes: [{
      id: entityId('linked-node'), projectId, title: '出货节点', destination: 'finished_to_warehouse',
      ownerUserId: BUYER.id, buyerUserId: BUYER.id, plannedStart: TODAY, plannedEnd: TODAY, ownerName: BUYER.name, buyerName: '关联节点采购',
      canReply: false, status: 'in_progress', version: 1, daysUntilRequired: 0, latestReply: null, replies: [],
      formalLink: { orderLineId: orderId, procurementLineId: orderId, oaRef: 'OA-LINKED' }, batches: [batch],
    }],
  }] };
}

async function seedWeeklyDelivery({ db, exec }: AppHandle) {
  await exec("update delivery_batches set planned_qty = 18000, planned_unit = '件', first_confirmed_date = '2026-11-10', status = 'partially_received' where id = 'batch-1'");
  const batch = { orderLineId: 'line-1', createdAt: AT, updatedAt: AT, plannedQty: '5', plannedUnit: '件',
    receiverPartyId: 'party-other', status: 'confirmed', statusChangedAt: AT, origin: 'manual' };
  await db.insert(deliveryBatches).values([
    { ...batch, id: 'batch-carry', seq: 4, dateBuyerConfirmed: '2026-11-05', firstConfirmedDate: '2026-11-03' },
    { ...batch, id: 'batch-done', seq: 5, dateBuyerConfirmed: '2026-11-09', status: 'received' },
    { ...batch, id: 'batch-next-later', seq: 6, dateBuyerConfirmed: '2026-11-17', dateSupplierPromised: '2026-11-19' },
    { ...batch, id: 'batch-next', seq: 7, dateBuyerConfirmed: '2026-11-19', dateSupplierPromised: '2026-11-18' },
    { ...batch, id: 'batch-cancelled', seq: 8, dateBuyerConfirmed: '2026-11-09', status: 'cancelled', cancelledAt: AT },
    { ...batch, id: 'batch-old-closed', seq: 9, dateBuyerConfirmed: '2026-11-06', status: 'closed', closedAt: AT },
  ]);
  const receipt = { batchId: 'batch-done', createdAt: AT, updatedAt: AT, qty: '5', category: 'finished', source: 'workbench', createdBy: BUYER.id,
    fulfillment: { kind: 'received', unit: '件', evidence: '验收单', disposition: 'normal', reviewReason: null } } as const;
  await db.insert(receipts).values([
    { ...receipt, id: 'weekly-receipt', receivedOn: '2026-11-10' },
    { ...receipt, id: 'weekly-voided-receipt', receivedOn: '2026-11-11', voidedAt: AT },
    { ...receipt, id: 'weekly-partial-receipt', batchId: 'batch-1', qty: '4000', receivedOn: '2026-11-08' },
  ]);
  await db.insert(shipments).values({
    id: 'weekly-partial-shipment', batchId: 'batch-1', createdAt: AT, updatedAt: AT, qty: '12000', shippedOn: '2026-11-07',
    source: 'manual', createdBy: BUYER.id, fulfillment: { kind: 'verified', unit: '件', evidence: '核实发货单', reviewReason: null },
  });
  const task = { createdAt: AT, updatedAt: AT, kind: 'task', priority: 'normal', source: 'manual', plannedStart: '2026-11-05', plannedEnd: '2026-11-05' };
  await db.insert(workItems).values([
    { ...task, id: 'past-predecessor', subjectType: 'standalone', title: '核对齐料', status: 'blocked' },
    { ...task, id: 'past-batch-task', subjectType: 'delivery_batch', subjectId: 'batch-carry', title: '核对批次发货', status: 'in_progress' },
  ]);
  await db.insert(workItemDependencies).values({ id: 'weekly-dependency', fromItemId: 'past-predecessor', toItemId: 'past-batch-task', kind: 'finish_to_start', createdAt: AT });
}
