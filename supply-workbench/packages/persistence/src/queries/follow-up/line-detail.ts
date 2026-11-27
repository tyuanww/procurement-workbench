import { procurementScheduleDates, procurementScheduleItems } from '../plan/procurement-schedule.js';
import { and, eq, inArray } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { isOwnerAccount } from '@sw/application';
import type { ExceptionView, FollowUpView, OrderLineDetail } from '@sw/application';
import { NotFoundError } from '@sw/application/errors';
import { CODE_TYPES, EXCEPTION_STATUSES, EXCEPTION_TYPES, FOLLOW_UP_KINDS, PO_FORMATS, REVIEW_STATUSES, TEMPLATE_IDS, withoutValue, type LocalDate, type ProcurementStore, type Provenance, type TemplateId } from '@sw/domain';
import type { AppDatabase } from '../../client.js';
import { ownerAssignmentRepository } from '../../repositories/owner-assignments.js';
import { instant } from '../../mappers/time.js';
import { importBatches, importRows, itemCodes } from '../../schema/index.js';
import { exceptions, followUps, orderLineSnapshots, orderLines } from '../../schema/orders.js';
import { storedFiles } from '../../schema/platform.js';
import { factoryInTransitRows, factoryMaterialDemandRows, factoryPackagingComboRows, factoryScheduleCells, factoryShipmentRows, factoryStockRows } from '../../schema/factory.js';
import { isRecord, oneOf } from './guards.js';
import { storeFilter } from '../store-progress/scope.js';
import { storeProgressOf } from '../store-progress/rows.js';
import { procurementDetail } from './procurement.js';
import { batchViews } from './batch-view.js';
import { activeFactoryBatchIds } from '../factory-links/snapshot-scope.js';
import { toRow, loadRelations, type ListWorld } from './line-row.js';
import { comboOf, demandOf, isAssociated, scheduleOf, shipmentOf, stockOf, transitOf } from './payloads.js';

const FOLLOW_UP_LIMIT = 50;
const PURCHASE_SOURCE_FIELDS = ['po', 'nameRaw', 'barcodeRaw', 'qtyOrdered', 'firstDeliveryOn', 'shippedQtyReported', 'statusReported'];
type Clock = { today(): LocalDate; now(): string };
type Read = { readonly db: AppDatabase; readonly clock: Clock; readonly timeZone: string };

export async function lineDetail(read: Read, { lineId, store }: { readonly lineId: string; readonly store: ProcurementStore | undefined }): Promise<OrderLineDetail> {
  const line = (await read.db.select().from(orderLines).where(and(eq(orderLines.id, lineId), storeFilter({ store, line: orderLines.id, hasMaterialScope: true }))))[0];
  if (line === undefined) throw new NotFoundError('订单行', lineId);
  const activeIds = await activeFactoryBatchIds(read.db);
  const world = await loadRelations(read.db, { lines: [line], activeFactoryBatchIds: activeIds });
  const [codes, snapshot, batches, reports, exceptionRows, followRows, procurement, progress, procurementSchedule, pendingBuyerName] = await Promise.all([
    codesOf(read.db, line.itemId),
    snapshotOf({ db: read.db, snapshotId: line.currentSnapshotId, now: read.clock.now() }),
    batchViews(read, lineId),
    reportsOf(read.db, { lineId, activeIds: [...activeIds] }),
    read.db.select().from(exceptions).where(eq(exceptions.orderLineId, lineId)),
    read.db.select().from(followUps).where(eq(followUps.orderLineId, lineId)),
    procurementDetail(read.db, { line, store: store === 'all' ? undefined : store }),
    store === undefined || line.lane !== 'finished' ? undefined : storeProgressOf(read.db, [lineId]),
    scheduleOfLine(read.db, line),
    pendingBuyerNameOf({ db: read.db, lineId, buyerId: line.buyerUserId, buyers: world.users }),
  ]);
  const evidence = await sourceEvidence(read.db, { lineId, batches, snapshot, reports });
  const storeProgress = progress?.get(lineId);
  return { ...(pendingBuyerName === null ? {} : { pendingBuyerName }), line: { ...(storeProgress === undefined ? {} : { storeProgress }), ...toRow({ line, world, clock: read.clock, timeZone: read.timeZone }), unit: line.unit, purchaseOrderId: line.purchaseOrderId, itemId: line.itemId, cancelledAt: line.cancelledAt, cancelReason: line.cancelReason }, po: poOf(world, line.purchaseOrderId), codes, snapshot, batches, factoryReports: reports, ...evidence, exceptions: exceptionRows.map(exceptionView), followUps: latest(followRows), ...(procurement === undefined ? {} : { procurement }), ...(procurementSchedule === undefined ? {} : { procurementSchedule }) };
}

async function pendingBuyerNameOf(input: { readonly db: AppDatabase; readonly lineId: string; readonly buyerId: string | null; readonly buyers: ListWorld['users'] }): Promise<string | null> {
  if (input.buyerId !== null) {
    const buyer = input.buyers.get(input.buyerId);
    if (buyer === undefined) return input.buyerId;
    return isOwnerAccount(buyer) ? null : buyer.name;
  }
  const assignment = await ownerAssignmentRepository(input.db).findCurrent(input.lineId);
  return assignment?.status === 'pending' ? assignment.ownerNameRaw : null;
}

async function scheduleOfLine(db: AppDatabase, line: Pick<typeof orderLines.$inferSelect, 'id' | 'lane' | 'origin'>) {
  if (line.lane !== 'finished' || line.origin !== 'import_po_master') return undefined;
  const lineId = line.id;
  const [dates, items] = await Promise.all([procurementScheduleDates(db, lineId), procurementScheduleItems(db, lineId)]);
  return { ...dates, items };
}

async function codesOf(db: AppDatabase, itemId: string | null): Promise<OrderLineDetail['codes']> {
  if (itemId === null) return [];
  const rows = await db.select().from(itemCodes).where(eq(itemCodes.itemId, itemId));
  return rows.map((row) => ({ id: row.id, codeType: oneOf(CODE_TYPES, row.codeType), codeRaw: row.codeRaw, codeNorm: row.codeNorm, itemId: row.itemId, status: oneOf(REVIEW_STATUSES, row.status) }));
}

function poOf(world: ListWorld, purchaseOrderId: string): OrderLineDetail['po'] {
  const order = world.orders.get(purchaseOrderId);
  if (order === undefined) throw new NotFoundError('采购单', purchaseOrderId);
  return { id: order.id, poRaw: order.poRaw, poFormat: oneOf(PO_FORMATS, order.poFormat), relatedPoRaws: order.relatedPoRaws };
}

async function snapshotOf({ db, snapshotId, now }: { readonly db: AppDatabase; readonly snapshotId: string | null; readonly now: string }): Promise<OrderLineDetail['snapshot']> {
  if (snapshotId === null) return null;
  const row = (await db.select().from(orderLineSnapshots).where(eq(orderLineSnapshots.id, snapshotId)))[0];
  if (row === undefined) return null;
  const batch = (await db.select().from(importBatches).where(eq(importBatches.id, row.importBatchId)))[0];
  const importRow = (await db.select().from(importRows).where(eq(importRows.id, row.importRowId)))[0];
  const at = batch?.committedAt ?? batch?.createdAt ?? now;
  const provenance = provenanceOf({ batch, row: importRow, at: instant(at) });
  const purchaseFields = purchaseImportFields(importRow?.parsed, provenance);
  return { importBatchId: row.importBatchId, at: instant(at), fields: { ...fieldsOf(row.data, provenance), ...purchaseFields } };
}

function purchaseImportFields(parsed: unknown, provenance: Provenance) {
  if (provenance.kind !== 'import' || provenance.template !== 'po-master-v1' || !isRecord(parsed)) return {};
  return fieldsOf(Object.fromEntries(PURCHASE_SOURCE_FIELDS.map((key) => [key, parsed[key]])), provenance);
}

function provenanceOf({ batch, row, at }: { readonly batch: typeof importBatches.$inferSelect | undefined; readonly row: typeof importRows.$inferSelect | undefined; readonly at: string }): Provenance {
  const template = batch === undefined ? undefined : templateOf(batch.template);
  if (batch === undefined || row === undefined || template === undefined) return { kind: 'system', rule: 'order_line_snapshot', at };
  return { kind: 'import', importBatchId: batch.id, template, sheet: row.sheetName, rowNo: row.rowNo, at };
}

function templateOf(value: string): TemplateId | undefined {
  for (const item of TEMPLATE_IDS) if (item === value) return item;
  return undefined;
}

function fieldsOf(data: unknown, provenance: Provenance): Record<string, NonNullable<ReturnType<typeof fieldOf>>> {
  if (!isRecord(data)) return {};
  const fields: Record<string, NonNullable<ReturnType<typeof fieldOf>>> = {};
  for (const [key, value] of Object.entries(data)) {
    const field = fieldOf(value, provenance);
    if (field !== undefined) fields[key] = field;
  }
  return fields;
}

function fieldOf(value: unknown, provenance: Provenance) {
  if (!isRecord(value) || !('value' in value)) return undefined;
  const raw = typeof value.raw === 'string' ? value.raw : undefined;
  if (value.value === null) return raw === undefined ? withoutValue({ reason: 'no_source', provenance }) : withoutValue({ reason: 'no_source', provenance, raw });
  return raw === undefined ? { value: value.value, provenance } : { value: value.value, raw, provenance };
}

async function reportsOf(db: AppDatabase, { lineId, activeIds }: { readonly lineId: string; readonly activeIds: readonly string[] }): Promise<OrderLineDetail['factoryReports']> {
  const [transit, shipment, stock, schedule, demand, combo] = await Promise.all([
    db.select().from(factoryInTransitRows).where(linkedTo({ lineId, activeIds, table: factoryInTransitRows })),
    db.select().from(factoryShipmentRows).where(linkedTo({ lineId, activeIds, table: factoryShipmentRows })),
    db.select().from(factoryStockRows).where(linkedTo({ lineId, activeIds, table: factoryStockRows })),
    db.select().from(factoryScheduleCells).where(linkedTo({ lineId, activeIds, table: factoryScheduleCells })),
    db.select().from(factoryMaterialDemandRows).where(linkedTo({ lineId, activeIds, table: factoryMaterialDemandRows })),
    db.select().from(factoryPackagingComboRows).where(linkedTo({ lineId, activeIds, table: factoryPackagingComboRows })),
  ]);
  return {
    inTransit: transit.filter((row) => isAssociated(row.linkStatus)).map(transitOf),
    shipments: shipment.filter((row) => isAssociated(row.linkStatus)).map(shipmentOf),
    stock: stock.filter((row) => isAssociated(row.linkStatus)).map(stockOf),
    schedule: schedule.filter((row) => isAssociated(row.linkStatus)).flatMap((row) => { const view = scheduleOf(row); return view === undefined ? [] : [view]; }),
    demand: demand.filter((row) => isAssociated(row.linkStatus)).map(demandOf),
    packagingCombo: combo.filter((row) => isAssociated(row.linkStatus)).map(comboOf),
  };
}

type LinkedFactoryTable = {
  readonly linkedOrderLineId: AnyPgColumn;
  readonly importBatchId: AnyPgColumn;
};

async function sourceEvidence(db: AppDatabase, { lineId, batches, snapshot, reports }: {
  readonly lineId: string;
  readonly batches: OrderLineDetail['batches'];
  readonly snapshot: OrderLineDetail['snapshot'];
  readonly reports: OrderLineDetail['factoryReports'];
}) {
  const archivedShipmentSources = await archivedShipments(db, { lineId, batches, current: reports.shipments });
  const sourceFiles = await sourceFileNames(db, [
    snapshot?.importBatchId,
    ...[...reports.demand, ...reports.inTransit, ...reports.shipments, ...archivedShipmentSources].map((row) => row.importBatchId),
  ]);
  return { sourceFiles, archivedShipmentSources };
}

async function archivedShipments(db: AppDatabase, { lineId, batches, current }: {
  readonly lineId: string;
  readonly batches: OrderLineDetail['batches'];
  readonly current: OrderLineDetail['factoryReports']['shipments'];
}) {
  const currentIds = new Set(current.map((row) => row.id));
  const ids = new Set<string>();
  for (const batch of batches) for (const shipment of batch.shipments) {
    const id = shipment.factoryShipmentRowId;
    if (shipment.voidedAt === null && id !== null && !currentIds.has(id)) ids.add(id);
  }
  if (ids.size === 0) return [];
  const rows = await db.select().from(factoryShipmentRows).where(and(
    eq(factoryShipmentRows.linkedOrderLineId, lineId), inArray(factoryShipmentRows.id, [...ids]),
  ));
  return rows.filter((row) => isAssociated(row.linkStatus)).map(shipmentOf);
}

async function sourceFileNames(db: AppDatabase, batchIds: readonly (string | undefined)[]) {
  const ids = [...new Set(batchIds.filter((id) => id !== undefined))];
  if (ids.length === 0) return {};
  const files = await db.select({ id: importBatches.id, name: storedFiles.originalName }).from(importBatches)
    .innerJoin(storedFiles, eq(storedFiles.id, importBatches.fileId))
    .where(inArray(importBatches.id, ids));
  return Object.fromEntries(files.map(({ id, name }) => [id, name]));
}

/** 行详情里的工厂上报同样只认活动快照，口径与列表的 activeFactoryBatchIds 一致。 */
function linkedTo(input: { readonly lineId: string; readonly activeIds: readonly string[]; readonly table: LinkedFactoryTable }): ReturnType<typeof and> {
  return and(eq(input.table.linkedOrderLineId, input.lineId), inArray(input.table.importBatchId, [...input.activeIds]));
}

function exceptionView(row: typeof exceptions.$inferSelect): ExceptionView {
  return { id: row.id, orderLineId: row.orderLineId, batchId: row.batchId, type: oneOf(EXCEPTION_TYPES, row.type), note: row.note, status: oneOf(EXCEPTION_STATUSES, row.status), openedBy: row.openedBy, closedBy: row.closedBy, closedAt: row.closedAt, closeNote: row.closeNote };
}

function latest(rows: readonly (typeof followUps.$inferSelect)[]): FollowUpView[] {
  return [...rows].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, FOLLOW_UP_LIMIT).map(followView);
}

function followView(row: typeof followUps.$inferSelect): FollowUpView {
  return {
    id: row.id, orderLineId: row.orderLineId, batchId: row.batchId,
    kind: oneOf(FOLLOW_UP_KINDS, row.kind), text: row.text, partyId: row.partyId, createdBy: row.createdBy,
    ...(row.reminder === null ? {} : { nextFollowUpAt: row.reminder.nextAt }),
  };
}
