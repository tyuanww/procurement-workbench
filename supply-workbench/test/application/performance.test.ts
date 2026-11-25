import { expect, it } from 'vitest';
import {currentlyOverdue, dueBatches, localDate, onTimeRate, stuckDistribution, type KpiBatch, type KpiInput, type OrderLineLoad, entityId} from '../../packages/domain/src/index.js';
import { makeGetBuyerLoad, makeGetStuckBatches, makeGetSupplierPerformance } from '../../packages/application/src/performance/index.js';
import type { PerformanceFacts, PerformanceReadModel } from '../../packages/application/src/ports/performance-read-model.js';
import type { StuckQuery } from '../../packages/application/src/performance/views.js';
import { aUser } from '../../packages/testkit/src/index.js';
import { createDb } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { performanceQueries } from '../../packages/persistence/src/queries/performance/index.js';

const from = localDate('2026-10-01');
const to = localDate('2026-10-31');
const today = localDate('2026-10-12');
const day = localDate;
const actor = aUser({ roles: ['manager'] });

function batch(patch: Partial<KpiBatch> & Pick<KpiBatch, 'id' | 'status'>): KpiBatch {
  return {
    lane: 'finished',
    firstConfirmedDate: null,
    dateBuyerConfirmed: null,
    statusChangedAt: '2026-10-12T00:00:00.000Z',
    cancelledAt: null,
    closedAt: null,
    buyerUserId: entityId('buyer-1'),
    supplierPartyId: entityId('supplier'),
    receiverPartyId: entityId('warehouse'),
    receipts: [],
    shipments: [],
    noteReturnedOn: null,
    ...patch,
  };
}

function kpi(batches: readonly KpiBatch[], extra: Partial<KpiInput> = {}): KpiInput {
  return { today, from, to, batches, lines: [], dateChanges: [], exceptions: [], ...extra };
}

function orderLine(id: string, patch: Pick<OrderLineLoad, 'stage' | 'lane'>): OrderLineLoad {
  return { id: entityId(id), buyerUserId: entityId('buyer-1'), ...patch };
}

const sample = kpi([
  batch({ id: entityId('ontime'), status: 'received', firstConfirmedDate: day('2026-10-05'), dateBuyerConfirmed: day('2026-10-05'), receipts: [{ receivedOn: day('2026-10-05'), voidedAt: null }] }),
  batch({ id: entityId('late'), status: 'received', firstConfirmedDate: day('2026-10-01'), dateBuyerConfirmed: day('2026-10-01'), receipts: [{ receivedOn: day('2026-10-08'), voidedAt: null }] }),
  batch({ id: entityId('closed'), status: 'closed', firstConfirmedDate: day('2026-10-02'), dateBuyerConfirmed: day('2026-10-02'), closedAt: '2026-10-03T00:00:00.000Z' }),
  batch({ id: entityId('cancelled'), status: 'cancelled', firstConfirmedDate: day('2026-10-03'), cancelledAt: '2026-10-03T00:00:00.000Z' }),
  batch({ id: entityId('overdue'), status: 'confirmed', firstConfirmedDate: day('2026-10-04'), dateBuyerConfirmed: day('2026-10-04'), statusChangedAt: '2026-10-04T00:00:00.000Z' }),
  batch({ id: entityId('future'), status: 'confirmed', firstConfirmedDate: day('2026-10-20'), dateBuyerConfirmed: day('2026-10-20') }),
  batch({ id: entityId('due-today'), status: 'confirmed', firstConfirmedDate: day('2026-10-12'), dateBuyerConfirmed: day('2026-10-12') }),
  batch({ id: entityId('outside'), status: 'received', firstConfirmedDate: day('2026-09-01'), receipts: [{ receivedOn: day('2026-09-02'), voidedAt: null }] }),
  batch({ id: entityId('voided'), status: 'confirmed', firstConfirmedDate: day('2026-10-06'), dateBuyerConfirmed: day('2026-10-20'), receipts: [{ receivedOn: day('2026-10-06'), voidedAt: '2026-10-07T00:00:00.000Z' }] }),
  batch({ id: entityId('changed'), status: 'confirmed', firstConfirmedDate: day('2026-10-07'), dateBuyerConfirmed: day('2026-10-15'), statusChangedAt: '2026-09-26T00:00:00.000Z' }),
  batch({ id: entityId('first-set'), status: 'confirmed', firstConfirmedDate: day('2026-10-08'), dateBuyerConfirmed: day('2026-10-08') }),
  batch({ id: entityId('noted'), status: 'received', firstConfirmedDate: day('2026-10-09'), dateBuyerConfirmed: day('2026-10-09'), receipts: [{ receivedOn: day('2026-10-09'), voidedAt: null }], shipments: [{ shippedOn: day('2026-10-09'), voidedAt: null }], noteReturnedOn: day('2026-10-11') }),
]);

const changes = kpi(sample.batches, {
  lines: [orderLine('line-1', { stage: 'awaiting_shipment', lane: 'finished' })],
  dateChanges: [
    { field: 'dateBuyerConfirmed', changedAt: '2026-09-01T00:00:00.000Z', isFirstSet: true },
    { field: 'dateBuyerConfirmed', changedAt: '2026-10-09T00:00:00.000Z', isFirstSet: false, supplierPartyId: entityId('supplier'), lane: 'finished' },
    { field: 'dateBuyerConfirmed', changedAt: '2026-10-08T00:00:00.000Z', isFirstSet: true },
  ],
  exceptions: [{ status: 'open', openedAt: '2026-10-01T00:00:00.000Z', closedAt: null, buyerUserId: entityId('buyer-1'), supplierPartyId: entityId('supplier'), lane: 'finished' }, { status: 'closed', openedAt: '2026-09-01T00:00:00.000Z', closedAt: '2026-10-02T00:00:00.000Z', buyerUserId: entityId('buyer-1') }],
});

function facts(input: KpiInput, extra: Partial<PerformanceFacts> = {}): PerformanceFacts {
  return {
    kpi: input,
    followUps: [{ buyerUserId: entityId('buyer-1'), on: day('2026-10-10') }],
    partyNames: { supplier: '宜侬', warehouse: '上海仓' },
    buyerNames: {},
    batchLabels: { overdue: { seq: 1, poRaw: 'PO1', nameRaw: '面膜', orderLineId: 'line-1' } },
    linkedFactoryOrderLineIds: new Set<string>(),
    unlinkedFactoryOrderLineIds: new Set<string>(),
    openExceptionOrderLineIds: new Set<string>(),
    pendingSupplierAliasOrderLineIds: new Set<string>(),
    bomMissingOrderLineIds: new Set<string>(),
    ...extra,
  };
}

function readModel(loaded: PerformanceFacts): PerformanceReadModel {
  return {
    load: async () => loaded,
    stuck: refusing,
    suppliers: refusing,
    buyers: refusing,
  };
}

function refusing(): never {
  throw new Error('用例不应调用已经算好的看板');
}

function query(patch: Partial<StuckQuery> = {}): StuckQuery {
  return { from, to, ...patch };
}

it('手算样例的三个用例与 D04 一致', async () => {
  const loaded = facts(changes);
  const performance = readModel(loaded);
  await expectStuck(performance);
  await expectSuppliers(performance);
  await expectBuyers(performance);
});

async function expectStuck(performance: PerformanceReadModel): Promise<void> {
  const stuck = await makeGetStuckBatches({ performance })(query(), actor);
  const table = stuckDistribution(changes.batches, today);
  const confirmed = stuck.distribution.find((row) => row.stage === 'confirmed');
  const overdue = stuck.items.find((item) => item.batchId === 'overdue');
  expect(stuck.kpis.overdue).toBe(currentlyOverdue(changes).numerator);
  expect(confirmed?.buckets['8-14']).toBe(table.confirmed?.['8-14']);
  expect(confirmed?.buckets['15+']).toBe(table.confirmed?.['15+']);
  expect(stuck.items[0]?.batchId).toBe('changed');
  expect(overdue).toMatchObject({ poRaw: 'PO1', nameRaw: '面膜', buyer: { id: 'buyer-1', name: null } });
}

async function expectSuppliers(performance: PerformanceReadModel): Promise<void> {
  const suppliers = await makeGetSupplierPerformance({ performance })(query(), actor);
  const row = suppliers.rows[0];
  expect(suppliers.rows).toHaveLength(1);
  expect(row).toMatchObject({
    displayName: '宜侬',
    dueBatches: { numerator: dueBatches(changes).numerator },
    onTime: { numerator: onTimeRate(changes).numerator, denominator: onTimeRate(changes).denominator },
    dateChanges: { numerator: 1 },
    openExceptions: { numerator: 1 },
  });
  expect(row?.weekly).toHaveLength(8);
  expect(row?.dueBatches.numerator).toBe(10);
  expect(row?.onTime).toMatchObject({ numerator: 2, denominator: 8 });
}

async function expectBuyers(performance: PerformanceReadModel): Promise<void> {
  const buyers = await makeGetBuyerLoad({ performance })(query(), actor);
  expect(buyers.rows[0]).toEqual({
    buyer: { id: 'buyer-1', name: null },
    openLines: 1,
    openBatches: 6,
    overdue: 2,
    dueToday: 1,
    missingDate: 0,
    openExceptions: 1,
    followUpsInPeriod: 1,
  });
}

it('线和期间会改供应商与采购的口径，卡点只吃线', async () => {
  const material = batch({ id: entityId('material'), status: 'shipped', lane: 'material', supplierPartyId: entityId('other'), firstConfirmedDate: day('2026-10-05'), dateBuyerConfirmed: day('2026-10-05') });
  const loaded = facts(kpi([...sample.batches, material], {
    lines: [
      orderLine('fin-line', { stage: 'awaiting_shipment', lane: 'finished' }),
      orderLine('mat-line', { stage: 'awaiting_receipt', lane: 'material' }),
      orderLine('done-line', { stage: 'done', lane: 'finished' }),
    ],
  }));
  const performance = readModel(loaded);
  const finished = await makeGetSupplierPerformance({ performance })(query({ lane: 'finished' }), actor);
  const all = await makeGetSupplierPerformance({ performance })(query(), actor);
  const short = await makeGetSupplierPerformance({ performance })(query({ to: day('2026-10-03') }), actor);
  const stuck = await makeGetStuckBatches({ performance })(query({ lane: 'finished' }), actor);
  expect(finished.rows.map((row) => row.partyId)).toEqual(['supplier']);
  expect(all.rows.map((row) => row.partyId).sort()).toEqual(['other', 'supplier']);
  const shortDue = short.rows.find((row) => row.partyId === 'supplier')?.dueBatches.numerator;
  expect(shortDue).toBe(dueBatches({ ...sample, to: day('2026-10-03') }).numerator);
  expect(shortDue).not.toBe(10);
  expect(stuck.items.map((item) => item.batchId)).not.toContain('material');
  const buyers = await makeGetBuyerLoad({ performance })(query({ lane: 'finished' }), actor);
  expect(buyers.rows[0]?.openLines).toBe(1);
  expect(buyers.rows[0]?.openBatches).toBe(6);
  expect(buyers.rows[0]?.followUpsInPeriod).toBeNull();
  expect(buyers.rows[0]?.openExceptions).toBeNull();
  expect(finished.rows[0]?.dateChanges.numerator).toBe(0);
});

it('供应商指标保留关联准确的事件，独立列出无法归属的事件', async () => {
  const unresolved = batch({ id: entityId('unknown'), status: 'confirmed', supplierPartyId: null });
  const loaded = facts(kpi([...changes.batches, unresolved], {
    dateChanges: [...changes.dateChanges, { field: 'dateBuyerConfirmed', changedAt: '2026-10-09T00:00:00Z', isFirstSet: false, supplierPartyId: null }],
    exceptions: [...changes.exceptions, { status: 'open', openedAt: '2026-10-02T00:00:00Z', closedAt: null }],
  }));
  const dashboard = await makeGetSupplierPerformance({ performance: readModel(loaded) })(query(), actor);
  expect(dashboard.rows).toHaveLength(1);
  expect(dashboard.rows[0]).toMatchObject({ dateChanges: { numerator: 1 }, openExceptions: { numerator: 1 } });
  expect(dashboard.unassigned).toEqual({ dateChanges: 1, openExceptions: 1 });
});

it('无批次的供应商仍显示本线开放异常', async () => {
  const openedAt = '2026-10-02T00:00:00Z';
  const loaded = facts(kpi([], { exceptions: [
    { status: 'open', openedAt, closedAt: null, supplierPartyId: entityId('finished-only'), lane: 'finished' },
    { status: 'open', openedAt, closedAt: null, supplierPartyId: entityId('material-only'), lane: 'material' },
    { status: 'closed', openedAt, closedAt: openedAt, supplierPartyId: entityId('closed-only'), lane: 'finished' },
    { status: 'open', openedAt, closedAt: null, supplierPartyId: null, lane: 'finished' },
  ] }));
  const getSuppliers = makeGetSupplierPerformance({ performance: readModel(loaded) });
  const finished = await getSuppliers(query({ lane: 'finished' }), actor);
  expect(finished.rows).toMatchObject([{ partyId: 'finished-only', dueBatches: { numerator: 0 }, openExceptions: { numerator: 1 } }]);
  expect(finished.unassigned).toEqual({ dateChanges: 0, openExceptions: 1 });
  const all = await getSuppliers(query(), actor);
  expect(all.rows.map((row) => row.partyId)).toEqual(['finished-only', 'material-only']);
});

it('卡点按订单行映射工厂关联、工厂未关联、未关闭异常、供应商待审和产品缺 BOM', async () => {
  const loaded = facts(kpi([...sample.batches]), {
    linkedFactoryOrderLineIds: new Set(['line-1']),
    unlinkedFactoryOrderLineIds: new Set(['line-1']),
    openExceptionOrderLineIds: new Set(['line-1']),
    pendingSupplierAliasOrderLineIds: new Set(['line-1']),
    bomMissingOrderLineIds: new Set(['line-1']),
  });
  const stuck = await makeGetStuckBatches({ performance: readModel(loaded) })(query(), actor);
  expect(stuck.items.find((item) => item.batchId === 'overdue')).toMatchObject({ factoryLinked: true, factoryUnlinked: true, exceptionOpen: true, supplierAliasPending: true, bomMissing: true });
  expect(stuck.items.find((item) => item.batchId === 'changed')).toMatchObject({ factoryLinked: false, factoryUnlinked: false, exceptionOpen: false, supplierAliasPending: false, bomMissing: false });
});

it('原因筛选和徽标使用同一批次判定，且其他原因保留可选数量', async () => {
  const pending = batch({ id: entityId('pending'), status: 'awaiting_date', buyerUserId: null });
  const data = facts(kpi([...sample.batches, pending]), {
    pendingSupplierAliasOrderLineIds: new Set(['line-1']),
    bomMissingOrderLineIds: new Set(['line-1']),
    unlinkedFactoryOrderLineIds: new Set(['line-1']),
    openExceptionOrderLineIds: new Set(['line-1']),
  });
  const getStuck = makeGetStuckBatches({ performance: readModel(data) });
  const cases = [
    ['missing_owner', ['pending']],
    ['missing_factory', ['changed', 'overdue', 'due-today', 'first-set', 'future', 'pending', 'voided']],
    ['supplier_pending', ['overdue']],
    ['missing_date', ['pending']],
    ['exception_open', ['overdue']],
    ['aged_15', ['changed']],
    ['bom_missing', ['overdue']],
    ['factory_demand_unlinked', ['overdue']],
  ] as const;
  for (const [cause, ids] of cases) {
    const result = await getStuck(query({ cause }), actor);
    expect(result.items.map((item) => item.batchId).sort()).toEqual([...ids].sort());
    expect(result.causeCounts[cause]).toBe(result.total);
    expect(result.causeCounts.missing_owner).toBe(1);
  }
});

it('卡点停留天数按同一分桶筛选清单和分布', async () => {
  const dates = ['2026-10-09', '2026-10-08', '2026-10-05', '2026-10-04', '2026-09-28', '2026-09-27'];
  const batches = dates.map((date) => batch({ id: entityId(date), status: 'confirmed', statusChangedAt: `${date}T00:00:00Z` }));
  const getStuck = makeGetStuckBatches({ performance: readModel(facts(kpi(batches))) });
  for (const [bucket, days] of [['0-3', [3]], ['4-7', [7, 4]], ['8-14', [14, 8]], ['15+', [15]]] as const) {
    const result = await getStuck(query({ bucket, stage: 'confirmed' }), actor);
    expect(result.items.map((item) => item.daysInStage)).toEqual(days);
    expect(result.distribution[0]?.buckets[bucket]).toBe(result.total);
  }
});

it('读模型从待审别名和 BOM 缺行算出订单行集合', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    const at = '2026-10-12T00:00:00.000Z';
    await handle.exec(`insert into users (id, created_at, updated_at, name, roles, active) values ('buyer-1', '${at}', '${at}', '样例采购员', '{manager}', true)`);
    await handle.exec(`insert into purchase_orders (id, created_at, updated_at, po_raw, po_norm, po_format, related_po_raws, supplier_party_id, supplier_raw, lane, oa_demand_ref) values ('po-alias', '${at}', '${at}', 'PO-A', 'PO-A', 'OTHER', '{}', null, ' 宜侬 ', 'finished', null)`);
    await handle.exec(`insert into purchase_orders (id, created_at, updated_at, po_raw, po_norm, po_format, related_po_raws, supplier_party_id, supplier_raw, lane, oa_demand_ref) values ('po-clean', '${at}', '${at}', 'PO-B', 'PO-B', 'OTHER', '{}', null, '别的供应商', 'finished', null)`);
    await insertLine(handle, { id: 'line-alias', purchaseOrderId: 'po-alias', barcode: '111', at });
    await insertLine(handle, { id: 'line-bom', purchaseOrderId: 'po-clean', barcode: '222', at });
    await insertLine(handle, { id: 'line-clean', purchaseOrderId: 'po-clean', barcode: '333', at });
    await handle.exec(`insert into party_aliases (id, created_at, updated_at, raw_name, norm_name, party_id, status, first_seen_import_batch_id, seen_count, seen_batch_count, reviewed_by, reviewed_at) values ('alias-1', '${at}', '${at}', ' 宜侬 ', '宜侬', null, 'pending', null, 1, 1, null, null)`);
    await insertProduct(handle, { id: 'product-bom', barcode: '222', at });
    await insertProduct(handle, { id: 'product-clean', barcode: '333', at });
    await handle.exec(`insert into bom_lines (product_barcode_raw, product_name, reorder_count, cumulative_qty, part_code_raw, part_name, import_batch_id, row_no, merged_fill) values ('333', '有 BOM 的产品', null, null, 'PART-1', '物料', 'batch-1', 2, false)`);

    const facts = await performanceQueries({ db: handle.db, clock: { today: () => today }, timeZone: 'Asia/Shanghai' }).load(query());
    expect([...facts.pendingSupplierAliasOrderLineIds]).toEqual(['line-alias']);
    expect([...facts.bomMissingOrderLineIds]).toEqual(['line-bom']);
  } finally {
    await handle.close();
  }
});

async function insertLine(handle: { readonly exec: (sql: string) => Promise<unknown> }, input: { readonly id: string; readonly purchaseOrderId: string; readonly barcode: string; readonly at: string }): Promise<void> {
  await handle.exec(`insert into order_lines (id, created_at, updated_at, purchase_order_id, lane, barcode_raw, origin, missing_in_latest_import, stage, stage_changed_at) values ('${input.id}', '${input.at}', '${input.at}', '${input.purchaseOrderId}', 'finished', '${input.barcode}', 'import_po_master', false, 'awaiting_shipment', '${input.at}')`);
}

async function insertProduct(handle: { readonly exec: (sql: string) => Promise<unknown> }, input: { readonly id: string; readonly barcode: string; readonly at: string }): Promise<void> {
  await handle.exec(`insert into products (id, created_at, updated_at, barcode_raw, barcode_base, sku_name, field_sources) values ('${input.id}', '${input.at}', '${input.at}', '${input.barcode}', '${input.barcode}', '产品', '{}'::jsonb)`);
}
