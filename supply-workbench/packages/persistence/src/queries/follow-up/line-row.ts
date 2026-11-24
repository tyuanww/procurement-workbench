import { countsInRecordedQuantity } from '@sw/domain';
import type { OrderLineRow } from '@sw/application';
import { BATCH_STATUSES, LANES, LINE_ORIGINS, LINE_STAGES, PO_FORMATS, daysInStage, localDate, overdueDays, projectLatestImportPresence, withValue, type LocalDate, type User } from '@sw/domain';
import { inArray } from 'drizzle-orm';
import type { AppDatabase } from '../../client.js';
import { userOfRow } from '../../repositories/users.js';
import { numberOrNull } from '../../mappers/number.js';
import { exceptions, factoryShipmentRows, orderLineSnapshots, orderLines, parties, purchaseOrders, receipts, users } from '../../schema/index.js';
import { deliveryBatches } from '../../schema/orders.js';
import { effectiveFactoryLinks, type EffectiveFactoryLink } from '../factory-links/line-association.js';
import { isRecord, oneOf, sumPresent } from './guards.js';

type Line = typeof orderLines.$inferSelect;
type Clock = { today(): LocalDate; now(): string };
type Scope = { readonly lines: readonly Line[]; readonly activeFactoryBatchIds: ReadonlySet<string> };

export type ListWorld = {
  readonly lines: readonly Line[];
  readonly orders: ReadonlyMap<string, typeof purchaseOrders.$inferSelect>;
  readonly parties: ReadonlyMap<string, string>;
  readonly users: ReadonlyMap<string, User>;
  readonly batches: readonly (typeof deliveryBatches.$inferSelect)[];
  readonly receipts: readonly (typeof receipts.$inferSelect)[];
  readonly exceptions: readonly (typeof exceptions.$inferSelect)[];
  readonly snapshots: readonly (typeof orderLineSnapshots.$inferSelect)[];
  readonly factoryShipments: readonly (typeof factoryShipmentRows.$inferSelect)[];
  readonly factoryLinks: ReadonlyMap<string, EffectiveFactoryLink>;
  readonly activeFactoryBatchIds: ReadonlySet<string>;
};

export async function loadRelations(db: AppDatabase, scope: Scope): Promise<ListWorld> {
  if (scope.lines.length === 0) return emptyWorld(scope.lines);
  return assemble(scope, await fetchRelations(db, scope));
}

function emptyWorld(lines: readonly Line[]): ListWorld {
  return { lines, orders: new Map(), parties: new Map(), users: new Map(), batches: [], receipts: [], exceptions: [], snapshots: [], factoryShipments: [], factoryLinks: new Map(), activeFactoryBatchIds: new Set() };
}

async function fetchRelations(db: AppDatabase, { lines, activeFactoryBatchIds }: Scope) {
  const lineIds = lines.map((row) => row.id);
  const orderIds = lines.map((row) => row.purchaseOrderId);
  const snapshotIds = lines.flatMap((row) => row.currentSnapshotId === null ? [] : [row.currentSnapshotId]);
  const buyerIds = lines.flatMap((row) => row.buyerUserId === null ? [] : [row.buyerUserId]);
  const [orders, batches, exceptionRows, snapshots, shipmentRows, userRows, factoryLinkRows] = await Promise.all([
    db.select().from(purchaseOrders).where(inArray(purchaseOrders.id, orderIds)),
    db.select().from(deliveryBatches).where(inArray(deliveryBatches.orderLineId, lineIds)),
    db.select().from(exceptions).where(inArray(exceptions.orderLineId, lineIds)),
    snapshotIds.length === 0 ? Promise.resolve([]) : db.select().from(orderLineSnapshots).where(inArray(orderLineSnapshots.id, snapshotIds)),
    db.select().from(factoryShipmentRows).where(inArray(factoryShipmentRows.linkedOrderLineId, lineIds)),
    buyerIds.length === 0 ? Promise.resolve([]) : db.select().from(users).where(inArray(users.id, buyerIds)),
    effectiveFactoryLinks({ db, activeFactoryBatchIds, lineIds }),
  ]);
  const batchIds = batches.map((row) => row.id);
  const receiptRows = batchIds.length === 0 ? [] : await db.select().from(receipts).where(inArray(receipts.batchId, batchIds));
  const partyRows = await partiesOf({ db, lines, orders, factoryLinks: factoryLinkRows });
  return { orders, batches, exceptionRows, snapshots, shipmentRows, userRows, receiptRows, partyRows, factoryLinkRows };
}

async function partiesOf(input: {
  readonly db: AppDatabase;
  readonly lines: readonly Line[];
  readonly orders: readonly (typeof purchaseOrders.$inferSelect)[];
  readonly factoryLinks: readonly (EffectiveFactoryLink)[];
}) {
  const { db, lines, orders } = input;
  const partyIds = [...new Set([
    ...orders.flatMap((row) => row.supplierPartyId === null ? [] : [row.supplierPartyId]),
    ...lines.flatMap((row) => row.receiverPartyId === null ? [] : [row.receiverPartyId]),
    ...input.factoryLinks.flatMap((row) => row.factoryPartyId === null ? [] : [row.factoryPartyId]),
  ])];
  if (partyIds.length === 0) return [];
  return db.select().from(parties).where(inArray(parties.id, partyIds));
}

function assemble({ lines, activeFactoryBatchIds }: Scope, fetched: Awaited<ReturnType<typeof fetchRelations>>): ListWorld {
  return {
    lines,
    orders: new Map(fetched.orders.map((row) => [row.id, row])),
    parties: new Map(fetched.partyRows.map((row) => [row.id, row.displayName])),
    users: new Map(fetched.userRows.map((row) => [row.id, userOfRow(row)])),
    batches: fetched.batches,
    receipts: fetched.receiptRows,
    exceptions: fetched.exceptionRows,
    snapshots: fetched.snapshots,
    factoryShipments: fetched.shipmentRows,
    factoryLinks: new Map(fetched.factoryLinkRows.map((row) => [row.orderLineId, row])),
    activeFactoryBatchIds,
  };
}

export function toRow(input: { readonly line: Line; readonly world: ListWorld; readonly clock: Clock; readonly timeZone: string }): OrderLineRow {
  const { line, world, clock, timeZone } = input;
  const order = world.orders.get(line.purchaseOrderId);
  if (order === undefined) throw new Error(`采购单不存在 ${line.purchaseOrderId}`);
  return {
    id: line.id,
    lane: oneOf(LANES, line.lane),
    po: { id: order.id, poRaw: order.poRaw, poFormat: oneOf(PO_FORMATS, order.poFormat) },
    nameRaw: line.nameRaw,
    itemCodeRaw: line.itemCodeRaw,
    barcodeRaw: line.barcodeRaw,
    supplier: supplierOf(order, world.parties),
    factory: factoryOf(line.id, world),
    receiver: receiverOf(line, world.parties),
    qtyOrdered: numberOrNull(line.qtyOrdered),
    receivedQty: receivedOf(line.id, world),
    factoryDeliveredQty: deliveredOf({ lineId: line.id, world, at: clock.now() }),
    stage: oneOf(LINE_STAGES, line.stage),
    nextDue: nextDue({ line, world, clock }),
    daysInStage: daysInStage({ stageChangedAt: line.stageChangedAt, today: clock.today(), timeZone }),
    buyer: buyerOf(line, world.users),
    statusReported: statusOf(line, world),
    ...projectLatestImportPresence({ latestImportPresence: line.latestImportPresence, missingInLatestImport: line.missingInLatestImport, origin: line.origin }),
    openExceptionCount: world.exceptions.filter((row) => row.orderLineId === line.id && row.status === 'open').length,
    origin: oneOf(LINE_ORIGINS, line.origin),
  };
}

function supplierOf(order: typeof purchaseOrders.$inferSelect, partiesById: ReadonlyMap<string, string>): OrderLineRow['supplier'] {
  return {
    id: order.supplierPartyId,
    displayName: order.supplierPartyId === null ? null : partiesById.get(order.supplierPartyId) ?? null,
    rawName: order.supplierRaw,
  };
}

function factoryOf(lineId: string, world: ListWorld): { readonly id: string; readonly displayName: string | null } | null {
  const link = world.factoryLinks.get(lineId);
  if (link?.factoryPartyId == null) return null;
  return { id: link.factoryPartyId, displayName: world.parties.get(link.factoryPartyId) ?? null };
}

function receiverOf(line: Line, partiesById: ReadonlyMap<string, string>): OrderLineRow['receiver'] {
  if (line.receiverPartyId === null) return null;
  return { id: line.receiverPartyId, displayName: partiesById.get(line.receiverPartyId) ?? null };
}

function buyerOf(line: Line, usersById: ListWorld['users']): OrderLineRow['buyer'] {
  if (line.buyerUserId === null) return null;
  return { id: line.buyerUserId, name: usersById.get(line.buyerUserId)?.name ?? line.buyerUserId };
}

function receivedOf(lineId: string, world: ListWorld): number | null {
  const batchIds = new Set(world.batches.filter((row) => row.orderLineId === lineId).map((row) => row.id));
  return sumPresent(world.receipts.filter((row) => batchIds.has(row.batchId) && countsInRecordedQuantity(row)).map((row) => numberOrNull(row.qty)));
}

function deliveredOf({ lineId, world, at }: { readonly lineId: string; readonly world: ListWorld; readonly at: string }): OrderLineRow['factoryDeliveredQty'] {
  const linked = world.factoryShipments.filter((row) => row.linkedOrderLineId === lineId && world.activeFactoryBatchIds.has(row.importBatchId) && isLinked(row.linkStatus));
  const source = linked[0];
  if (source === undefined) return missingDelivered('no_matching_record', at);
  const unique = new Map<string, (typeof linked)[number]>();
  for (const row of linked) unique.set(row.fingerprint, row);
  const qty = sumPresent([...unique.values()].map((row) => numberOrNull(row.qty)));
  if (qty === null) return missingDelivered('no_source', at);
  return withValue(qty, { kind: 'factory_report', importBatchId: source.importBatchId, factoryPartyId: source.factoryPartyId, sheet: source.sheetName, rowNo: source.rowNo, at });
}

function missingDelivered(reason: 'no_matching_record' | 'no_source', at: string): OrderLineRow['factoryDeliveredQty'] {
  return { value: null, missingReason: reason, provenance: { kind: 'system', rule: 'factoryDeliveredQty', at } };
}

function isLinked(status: string): boolean {
  return status === 'linked' || status === 'manual';
}

function nextDue({ line, world, clock }: { readonly line: Line; readonly world: ListWorld; readonly clock: Clock }): OrderLineRow['nextDue'] {
  if (line.nextDueBatchId === null) return null;
  const date = line.nextDueDate === null ? null : localDate(line.nextDueDate);
  const batch = world.batches.find((row) => row.id === line.nextDueBatchId);
  const overdue = batch === undefined || date === null ? null : overdueDays({ status: oneOf(BATCH_STATUSES, batch.status), dateBuyerConfirmed: date }, clock.today());
  return { batchId: line.nextDueBatchId, dateBuyerConfirmed: date, overdueDays: overdue, dateFactoryRequired: factoryDate(batch) };
}

function factoryDate(batch: (typeof deliveryBatches.$inferSelect) | undefined): LocalDate | null {
  if (batch === undefined || batch.dateFactoryRequired === null) return null;
  return localDate(batch.dateFactoryRequired);
}

function statusOf(line: Line, world: ListWorld): string | null {
  if (line.currentSnapshotId === null) return null;
  const snapshot = world.snapshots.find((row) => row.id === line.currentSnapshotId);
  return statusValue(snapshot?.data);
}

function statusValue(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const cell = data.statusReported;
  if (!isRecord(cell) || typeof cell.value !== 'string' || cell.value === '') return null;
  return cell.value;
}
