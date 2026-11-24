import { LANES, LINE_STAGES, businessDay, normalizeText, type EntityId, type KpiBatch, type KpiInput, type Lane, type LocalDate, type OrderLineLoad } from '@sw/domain';
import { entityId, entityIdOrNull } from '../../mappers/id.js';
import type { PerformanceReadModel } from '../../../../application/src/ports/performance-read-model.js';
import type { AppDatabase } from '../../client.js';
import { instant, instantOrNull } from '../../mappers/time.js';
import { deliveryBatches, deliveryNotes, exceptions, followUps, orderLines, purchaseOrders, receipts, shipments, batchDateChanges } from '../../schema/orders.js';
import { partyAliases, parties, users } from '../../schema/platform.js';
import { bomLines, products } from '../../schema/archive.js';
import { effectiveFactoryLinks, type EffectiveFactoryLink } from '../factory-links/line-association.js';
import { activeFactoryBatchIds } from '../factory-links/snapshot-scope.js';
import { toBatch } from './batch.js';

type Clock = { today(): LocalDate };

export function performanceQueries({ db, clock, timeZone }: { readonly db: AppDatabase; readonly clock: Clock; readonly timeZone: string }): PerformanceReadModel {
  return {
    load: (query) => loadFacts(db, { clock, timeZone, lane: query.lane, from: query.from, to: query.to }),
    stuck: notUsed,
    suppliers: notUsed,
    buyers: notUsed,
  };
}

function notUsed(): never {
  throw new Error('看板计算在用例里');
}

async function loadFacts(db: AppDatabase, ctx: { readonly clock: Clock; readonly timeZone: string; readonly lane: Lane | undefined; readonly from: LocalDate; readonly to: LocalDate }) {
  const [batchRows, lineRows, orderRows, receiptRows, shipmentRows, noteRows, changeRows, exceptionRows, factoryLinkRows, followRows, partyRows, userRows, aliasRows, productRows, bomRows] = await Promise.all([
    db.select().from(deliveryBatches),
    db.select().from(orderLines),
    db.select().from(purchaseOrders),
    db.select().from(receipts),
    db.select().from(shipments),
    db.select().from(deliveryNotes),
    db.select().from(batchDateChanges),
    db.select().from(exceptions),
    activeFactoryBatchIds(db).then((activeIds) => effectiveFactoryLinks({ db, activeFactoryBatchIds: activeIds })),
    db.select().from(followUps),
    db.select().from(parties),
    db.select().from(users),
    db.select().from(partyAliases),
    db.select().from(products),
    db.select().from(bomLines),
  ]);
  const lines = new Map(lineRows.map((row) => [row.id, row]));
  const orders = new Map(orderRows.map((row) => [row.id, row]));
  const batches = batchRows.flatMap((row) => toBatch({ row, lines, orders, receiptRows, shipmentRows, noteRows, lane: ctx.lane }));
  const batchesById = new Map<string, (typeof batches)[number]>(batches.map((batch) => [batch.id, batch]));
  return {
    kpi: kpiOf({ ctx, batches, batchesById, lineRows, changeRows, exceptionRows, lines, orders }),
    followUps: followRows.map((row) => ({ buyerUserId: entityId(row.createdBy), on: businessDay(instant(row.createdAt), ctx.timeZone) })),
    partyNames: Object.fromEntries(partyRows.map((row) => [row.id, row.displayName])),
    buyerNames: Object.fromEntries(userRows.map((row) => [row.id, row.name])),
    batchLabels: Object.fromEntries(batchRows.flatMap((row) => labelOf({ row, lines, orders }))),
    linkedFactoryOrderLineIds: linkedFactoryLineIds(factoryLinkRows),
    unlinkedFactoryOrderLineIds: unlinkedFactoryLineIds(factoryLinkRows),
    openExceptionOrderLineIds: openExceptionLineIds(exceptionRows),
    pendingSupplierAliasOrderLineIds: pendingSupplierAliasLineIds({ aliasRows, lineRows, orders }),
    bomMissingOrderLineIds: bomMissingLineIds({ lineRows, productRows, bomRows }),
  };
}

type KpiSources = {
  readonly ctx: { readonly clock: Clock; readonly from: LocalDate; readonly to: LocalDate };
  readonly batches: KpiInput['batches'];
  readonly batchesById: ReadonlyMap<string, KpiBatch>;
  readonly lineRows: readonly (typeof orderLines.$inferSelect)[];
  readonly changeRows: readonly (typeof batchDateChanges.$inferSelect)[];
  readonly exceptionRows: readonly (typeof exceptions.$inferSelect)[];
  readonly lines: ReadonlyMap<string, typeof orderLines.$inferSelect>;
  readonly orders: ReadonlyMap<string, typeof purchaseOrders.$inferSelect>;
};

function kpiOf(input: KpiSources): KpiInput {
  return {
    today: input.ctx.clock.today(),
    from: input.ctx.from,
    to: input.ctx.to,
    batches: input.batches,
    lines: input.lineRows.flatMap(lineLoad),
    dateChanges: input.changeRows.flatMap((row) => dateChangeOf(row, input.batchesById)),
    exceptions: input.exceptionRows.map((row) => exceptionOf(row, input)),
  };
}

function dateChangeOf(row: KpiSources['changeRows'][number], batches: KpiSources['batchesById']): KpiInput['dateChanges'] {
  if (row.field !== 'dateBuyerConfirmed') return [];
  const batch = batches.get(row.batchId);
  return [{
    field: 'dateBuyerConfirmed', changedAt: instant(row.changedAt), isFirstSet: row.oldValue === null,
    supplierPartyId: batch?.supplierPartyId ?? null, ...(batch === undefined ? {} : { lane: batch.lane }),
  }];
}

function exceptionOf(row: KpiSources['exceptionRows'][number], input: KpiSources): KpiInput['exceptions'][number] {
  const line = input.lines.get(row.orderLineId);
  const batch = row.batchId === null ? undefined : input.batchesById.get(row.batchId);
  const lane = line === undefined ? null : known(LANES, line.lane);
  const supplier = line === undefined ? null : input.orders.get(line.purchaseOrderId)?.supplierPartyId ?? null;
  return {
    status: row.status === 'closed' ? 'closed' : 'open',
    openedAt: instant(row.createdAt),
    closedAt: instantOrNull(row.closedAt),
    buyerUserId: resolveExceptionBuyer({ lineBuyerUserId: line?.buyerUserId, batchBuyerUserId: batch?.buyerUserId }),
    supplierPartyId: entityIdOrNull(supplier),
    ...(lane === null ? {} : { lane }),
  };
}

function linkedFactoryLineIds(rows: readonly EffectiveFactoryLink[]): ReadonlySet<string> {
  return new Set(rows.flatMap((row) => (row.status === 'linked' || row.status === 'manual' ? [row.orderLineId] : [])));
}

function unlinkedFactoryLineIds(rows: readonly EffectiveFactoryLink[]): ReadonlySet<string> {
  return new Set(rows.flatMap((row) => (row.status === 'unlinked' ? [row.orderLineId] : [])));
}

function openExceptionLineIds(rows: readonly (typeof exceptions.$inferSelect)[]): ReadonlySet<string> {
  return new Set(rows.flatMap((row) => (row.status === 'open' ? [row.orderLineId] : [])));
}

/** 与别名审核同一套 normalizeText：待审核别名的 normName 命中采购单供应商原文的订单行。 */
function pendingSupplierAliasLineIds(input: {
  readonly aliasRows: readonly (typeof partyAliases.$inferSelect)[];
  readonly lineRows: readonly (typeof orderLines.$inferSelect)[];
  readonly orders: ReadonlyMap<string, typeof purchaseOrders.$inferSelect>;
}): ReadonlySet<string> {
  const pending = new Set(input.aliasRows.filter((row) => row.status === 'pending').map((row) => row.normName));
  if (pending.size === 0) return new Set();
  return new Set(input.lineRows.flatMap((line) => {
    const supplierRaw = input.orders.get(line.purchaseOrderId)?.supplierRaw ?? null;
    if (supplierRaw === null || normalizeText(supplierRaw) === '') return [];
    return pending.has(normalizeText(supplierRaw)) ? [line.id] : [];
  }));
}

/** 产品档案有条码但 bom_lines 没有该条码的任何行时，订单行算产品缺 BOM。 */
function bomMissingLineIds(input: {
  readonly lineRows: readonly (typeof orderLines.$inferSelect)[];
  readonly productRows: readonly (typeof products.$inferSelect)[];
  readonly bomRows: readonly (typeof bomLines.$inferSelect)[];
}): ReadonlySet<string> {
  const barcodesWithBom = new Set(input.bomRows.map((row) => normalizeText(row.productBarcodeRaw)));
  const productsWithoutBom = new Set(input.productRows.flatMap((row) => {
    const barcode = normalizeText(row.barcodeRaw);
    if (barcode === '' || barcodesWithBom.has(barcode)) return [];
    return [barcode];
  }));
  if (productsWithoutBom.size === 0) return new Set();
  return new Set(input.lineRows.flatMap((line) => {
    const barcode = line.barcodeRaw === null ? '' : normalizeText(line.barcodeRaw);
    return barcode !== '' && productsWithoutBom.has(barcode) ? [line.id] : [];
  }));
}

export function resolveExceptionBuyer(input: { readonly lineBuyerUserId: string | null | undefined; readonly batchBuyerUserId: string | null | undefined }): EntityId | null {
  return entityIdOrNull(input.lineBuyerUserId ?? input.batchBuyerUserId ?? null);
}

function lineLoad(row: typeof orderLines.$inferSelect): OrderLineLoad[] {
  const lane = known(LANES, row.lane);
  const stage = known(LINE_STAGES, row.stage);
  if (lane === null || stage === null) return [];
  return [{
    id: entityId(row.id),
    buyerUserId: entityIdOrNull(row.buyerUserId),
    lane,
    stage,
  }];
}

function known<T extends string>(values: readonly T[], value: string): T | null {
  for (const item of values) if (item === value) return item;
  return null;
}

function labelOf({ row, lines, orders }: { readonly row: typeof deliveryBatches.$inferSelect; readonly lines: Map<string, typeof orderLines.$inferSelect>; readonly orders: Map<string, typeof purchaseOrders.$inferSelect> }) {
  const line = lines.get(row.orderLineId);
  const order = line === undefined ? undefined : orders.get(line.purchaseOrderId);
  if (line === undefined || order === undefined) return [];
  return [[row.id, { seq: row.seq, poRaw: order.poRaw, nameRaw: line.nameRaw, orderLineId: line.id }]];
}
