import { and, desc, eq, isNotNull, ne, notExists } from 'drizzle-orm';
import { BATCH_STATUSES, LANES, LINE_STAGES, PO_FORMATS, batchFulfillment, businessDay, compareDates, countsInRecordedQuantity, isOpenBatch, localDate, noteStatus, overdueDays, type LocalDate, type NoteStatus } from '@sw/domain';
import type { PendingBatchSource, TodayCatalog, TodoBatchSource, TodoBatchView, TodoExceptionSource, TodoLineView } from '../../../../application/src/today/views.js';
import type { TodayReadModel, UncommittedImport } from '../../../../application/src/ports/today-read-model.js';
import type { AppDatabase } from '../../client.js';
import { numberOrNull } from '../../mappers/number.js';
import { reportedOrderStatus } from '../../mappers/reported-order-status.js';
import { instant } from '../../mappers/time.js';
import { parties, partyAliases, itemCodes, codeLinks } from '../../schema/platform.js';
import { deliveryBatches, deliveryNotes, exceptions, followUps, orderLines, orderLineSnapshots, purchaseOrders, receipts, shipments } from '../../schema/orders.js';
import { importBatches } from '../../schema/archive.js';

export function todayQueries({ db, timeZone }: { readonly db: AppDatabase; readonly timeZone: string }): TodayReadModel {
  return {
    loadCatalog: (asOf) => loadCatalog(db, asOf),
    loadPendingBatch: (buyerId) => loadPendingBatch(db, buyerId),
    loadOpenExceptions: () => loadOpenExceptions(db),
    loadReviewCounts: () => loadReviewCounts(db),
    loadUncommittedImports: (actorId) => loadUncommittedImports({ db, actorId, timeZone }),
  };
}

async function loadCatalog(db: AppDatabase, today: LocalDate): Promise<TodayCatalog> {
  const [heads, lines, orders, shipped, received, notes, names, followUpRows, promiseRows] = await Promise.all([
    db.select().from(deliveryBatches),
    db.select().from(orderLines),
    db.select().from(purchaseOrders),
    db.select().from(shipments),
    db.select().from(receipts),
    db.select().from(deliveryNotes),
    db.select({ id: parties.id, displayName: parties.displayName }).from(parties),
    latestFollowUps(db, false),
    latestFollowUps(db, true),
  ]);
  const lineOf = new Map(lines.map((row) => [row.id, row]));
  const orderOf = new Map(orders.map((row) => [row.id, row]));
  const child = {
    shipped: rowsByBatch(shipped),
    received: rowsByBatch(received),
    notes: rowsByBatch(notes),
  };
  const viewRows = heads.map((head) => ({
    head,
    fulfillment: fulfillmentOf(head, child),
    latestFollowUp: followUpRows.get(head.id),
    latestPromise: promiseRows.get(head.id),
  }));
  return {
    sources: viewRows.flatMap((batch) => batchSource({ ...batch, lineOf, orderOf, child, today })),
    lines: lines.flatMap((line) => lineView({ line, order: orderOf.get(line.purchaseOrderId) })),
    batches: viewRows.flatMap((batch) => batchView({ ...batch, child })),
    parties: names,
  };
}

async function loadPendingBatch(db: AppDatabase, buyerId: string | null): Promise<readonly PendingBatchSource[]> {
  const hasBatch = db.select({ id: deliveryBatches.id }).from(deliveryBatches).where(eq(deliveryBatches.orderLineId, orderLines.id));
  const rows = await db.select({
    orderLineId: orderLines.id,
    poRaw: purchaseOrders.poRaw,
    nameRaw: orderLines.nameRaw,
    qtyOrdered: orderLines.qtyOrdered,
    unit: orderLines.unit,
    buyerUserId: orderLines.buyerUserId,
    receiverPartyId: parties.id,
    receiverIsOwnWarehouse: parties.isOwnWarehouse,
    cancelledAt: orderLines.cancelledAt,
    stage: orderLines.stage,
    reportedStatus: reportedOrderStatus,
  }).from(orderLines)
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId))
    .leftJoin(orderLineSnapshots, eq(orderLineSnapshots.id, orderLines.currentSnapshotId))
    .leftJoin(parties, eq(parties.id, orderLines.receiverPartyId))
    .where(and(isNotNull(orderLines.buyerUserId), buyerId === null ? undefined : eq(orderLines.buyerUserId, buyerId), notExists(hasBatch)))
    .orderBy(purchaseOrders.poRaw, orderLines.nameRaw, orderLines.id);
  return rows.flatMap(({ buyerUserId, stage: stageRaw, qtyOrdered, receiverIsOwnWarehouse, ...row }) => {
    const stage = known(LINE_STAGES, stageRaw);
    const qty = numberOrNull(qtyOrdered);
    return buyerUserId === null || stage === null ? [] : [{
      ...row, buyerUserId, stage, qtyOrdered: Number.isFinite(qty) ? qty : null, receiverIsOwnWarehouse: receiverIsOwnWarehouse === true,
    }];
  });
}

async function latestFollowUps(db: AppDatabase, promisesOnly: boolean): Promise<ReadonlyMap<string, NonNullable<TodoBatchView['latestFollowUp']>>> {
  const rows = await db.selectDistinctOn([followUps.batchId], { batchId: followUps.batchId, id: followUps.id, text: followUps.text, createdAt: followUps.createdAt })
    .from(followUps)
    .where(and(isNotNull(followUps.batchId), promisesOnly ? eq(followUps.kind, 'promise') : ne(followUps.kind, 'promise')))
    .orderBy(followUps.batchId, desc(followUps.createdAt), desc(followUps.id));
  return new Map(rows.flatMap(({ batchId, createdAt, ...row }) => batchId === null ? [] : [[batchId, { ...row, createdAt: instant(createdAt) }]]));
}

function rowsByBatch<T extends { readonly batchId: string }>(rows: readonly T[]): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const found = grouped.get(row.batchId);
    if (found === undefined) grouped.set(row.batchId, [row]);
    else found.push(row);
  }
  return grouped;
}

function lineView(input: {
  readonly line: typeof orderLines.$inferSelect;
  readonly order: typeof purchaseOrders.$inferSelect | undefined;
}): TodoLineView[] {
  const lane = known(LANES, input.line.lane);
  if (lane === null) return [];
  const poFormat = input.order === undefined ? null : known(PO_FORMATS, input.order.poFormat);
  if (input.order !== undefined && poFormat === null) return [];
  return [{
    id: input.line.id,
    lane,
    poRaw: input.order === undefined ? null : input.order.poRaw,
    poFormat,
    nameRaw: input.line.nameRaw,
    itemCodeRaw: input.line.itemCodeRaw,
    barcodeRaw: input.line.barcodeRaw,
    buyerName: null,
  }];
}

type ChildRows = {
  readonly shipped: ReadonlyMap<string, readonly (typeof shipments.$inferSelect)[]>;
  readonly received: ReadonlyMap<string, readonly (typeof receipts.$inferSelect)[]>;
  readonly notes: ReadonlyMap<string, readonly (typeof deliveryNotes.$inferSelect)[]>;
};

function fulfillmentOf(head: typeof deliveryBatches.$inferSelect, child: ChildRows) {
  return batchFulfillment({
    batch: { plannedQty: Number(head.plannedQty), plannedUnit: head.plannedUnit },
    shipments: rowsOf(child.shipped, head.id).map((row) => ({ ...row, qty: Number(row.qty) })),
    receipts: rowsOf(child.received, head.id).map((row) => ({ ...row, qty: Number(row.qty) })),
  });
}

function batchView(input: {
  readonly head: typeof deliveryBatches.$inferSelect;
  readonly child: ChildRows;
  readonly fulfillment: TodoBatchSource['fulfillment'];
  readonly latestFollowUp: TodoBatchView['latestFollowUp'];
  readonly latestPromise: TodoBatchView['latestPromise'];
}): TodoBatchView[] {
  const status = known(BATCH_STATUSES, input.head.status);
  if (status === null) return [];
  const shipped = activeShipments(rowsOf(input.child.shipped, input.head.id));
  const received = activeReceipts(rowsOf(input.child.received, input.head.id));
  return [{
    id: input.head.id,
    seq: input.head.seq,
    plannedQty: Number(input.head.plannedQty),
    status,
    noteStatus: noteOf(rowsOf(input.child.notes, input.head.id)),
    dateBuyerConfirmed: dayOrNull(input.head.dateBuyerConfirmed),
    firstConfirmedDate: dayOrNull(input.head.firstConfirmedDate),
    dateFactoryRequired: dayOrNull(input.head.dateFactoryRequired),
    dateSupplierPromised: dayOrNull(input.head.dateSupplierPromised),
    shippedQty: qtySum(shipped),
    receivedQty: qtySum(received),
    lastShippedOn: latestDay(shipped),
    fulfillment: input.fulfillment,
    ...(input.latestFollowUp === undefined ? {} : { latestFollowUp: input.latestFollowUp }),
    ...(input.latestPromise === undefined ? {} : { latestPromise: input.latestPromise }),
  }];
}

function known<T extends string>(values: readonly T[], value: string): T | null {
  for (const item of values) if (item === value) return item;
  return null;
}

function qtySum(rows: readonly { readonly qty: number }[]): number {
  return rows.reduce((sum, row) => sum + row.qty, 0);
}

function latestDay(rows: readonly { readonly shippedOn: LocalDate }[]): LocalDate | null {
  return rows.reduce<LocalDate | null>((latest, row) => {
    if (latest === null || compareDates(row.shippedOn, latest) > 0) return row.shippedOn;
    return latest;
  }, null);
}

function batchSource(input: {
  readonly head: typeof deliveryBatches.$inferSelect;
  readonly lineOf: ReadonlyMap<string, typeof orderLines.$inferSelect>;
  readonly orderOf: ReadonlyMap<string, typeof purchaseOrders.$inferSelect>;
  readonly child: ChildRows;
  readonly today: LocalDate;
  readonly fulfillment: TodoBatchSource['fulfillment'];
}): TodoBatchSource[] {
  const line = input.lineOf.get(input.head.orderLineId);
  if (line === undefined) return [];
  const note = noteOf(rowsOf(input.child.notes, input.head.id));
  if (!listed(input.head.status)) return [];
  const confirmed = dayOrNull(input.head.dateBuyerConfirmed);
  const factory = dayOrNull(input.head.dateFactoryRequired);
  const promised = dayOrNull(input.head.dateSupplierPromised);
  return [{
    id: input.head.id,
    orderLineId: input.head.orderLineId,
    isLineCancelled: line.cancelledAt !== null,
    ownerUserId: line.buyerUserId,
    status: oneStatus(input.head.status),
    plannedQty: Number(input.head.plannedQty),
    dateBuyerConfirmed: confirmed,
    dateFactoryRequired: factory,
    dateSupplierPromised: promised,
    receiverPartyId: input.head.receiverPartyId,
    supplierPartyId: input.orderOf.get(line.purchaseOrderId)?.supplierPartyId ?? null,
    overdueDays: overdueDays({ status: oneStatus(input.head.status), dateBuyerConfirmed: confirmed }, input.today),
    noteStatus: note,
    shipments: activeShipments(rowsOf(input.child.shipped, input.head.id)),
    receipts: activeReceipts(rowsOf(input.child.received, input.head.id)),
    earliestHintDate: earliest(factory, promised),
    fulfillment: input.fulfillment,
  }];
}

function listed(status: string): boolean {
  return status === 'received' || isOpenBatch(oneStatus(status));
}

function rowsOf<T>(grouped: ReadonlyMap<string, readonly T[]>, batchId: string): readonly T[] {
  return grouped.get(batchId) ?? [];
}

function noteOf(notes: readonly (typeof deliveryNotes.$inferSelect)[]): NoteStatus {
  const row = notes.find((item) => item.voidedAt === null);
  if (row === undefined || row.status === 'missing') return 'missing';
  return noteStatus({ status: row.status === 'verified' ? 'verified' : 'returned', voidedAt: null });
}

function activeShipments(rows: readonly (typeof shipments.$inferSelect)[]) {
  return rows.flatMap((row) => {
    if (!countsInRecordedQuantity(row)) return [];
    const qty = numberOrNull(row.qty);
    if (qty === null) return [];
    return [{ qty, shippedOn: localDate(row.shippedOn) }];
  });
}

function activeReceipts(rows: readonly (typeof receipts.$inferSelect)[]) {
  return rows.flatMap((row) => {
    if (!countsInRecordedQuantity(row)) return [];
    const qty = numberOrNull(row.qty);
    if (qty === null) return [];
    return [{ qty, receivedOn: localDate(row.receivedOn) }];
  });
}

function earliest(left: LocalDate | null, right: LocalDate | null): LocalDate | null {
  if (left === null) return right;
  if (right === null) return left;
  return compareDates(left, right) <= 0 ? left : right;
}

function dayOrNull(value: string | null): LocalDate | null {
  return value === null ? null : localDate(value);
}

function oneStatus(value: string): TodoBatchSource['status'] {
  if (value === 'awaiting_date' || value === 'confirmed' || value === 'shipped' || value === 'partially_received' || value === 'received' || value === 'closed' || value === 'cancelled') return value;
  throw new Error(`未知批次状态 ${value}`);
}

async function loadOpenExceptions(db: AppDatabase): Promise<readonly TodoExceptionSource[]> {
  const rows = await db.select().from(exceptions).where(eq(exceptions.status, 'open'));
  return rows.map((row) => ({ id: row.id, orderLineId: row.orderLineId, batchId: row.batchId, type: row.type, note: row.note, openedBy: row.openedBy }));
}

async function loadReviewCounts(db: AppDatabase) {
  const [aliases, codes, links] = await Promise.all([
    db.select().from(partyAliases).where(eq(partyAliases.status, 'pending')),
    db.select().from(itemCodes).where(eq(itemCodes.status, 'pending')),
    db.select().from(codeLinks).where(eq(codeLinks.status, 'pending')),
  ]);
  return { aliases: aliases.length, codes: codes.length, links: links.length, multiName: 0 };
}

async function loadUncommittedImports({ db, actorId, timeZone }: { readonly db: AppDatabase; readonly actorId: string; readonly timeZone: string }): Promise<readonly UncommittedImport[]> {
  const rows = await db.select().from(importBatches).where(eq(importBatches.createdBy, actorId));
  return rows.flatMap((row) => row.status === 'parsed' ? [{ id: row.id, createdBy: row.createdBy, createdAt: `${businessDay(instant(row.createdAt), timeZone)}T12:00:00.000Z` }] : []);
}
