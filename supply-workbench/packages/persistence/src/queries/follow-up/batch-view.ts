import type { BatchView, DateChangeView, DeliveryNoteView, ReceiptView, ShipmentView } from '@sw/application';
import { batchFulfillment, countsInRecordedQuantity, daysInStage, type FulfillmentEvidence, noteStatus, overdueDays, qtyVariance, type LocalDate } from '@sw/domain';
import type { AppDatabase } from '../../client.js';
import { deliveryBatchRepository } from '../../repositories/delivery-batches.js';
import { sumPresent } from './guards.js';

type Loaded = Awaited<ReturnType<ReturnType<typeof deliveryBatchRepository>['getWithRecords']>>;

type Clock = { today(): LocalDate };
type Read = { readonly db: AppDatabase; readonly clock: Clock; readonly timeZone: string };

export async function batchView(read: Read, batchId: string): Promise<BatchView> {
  return viewOf({ loaded: await deliveryBatchRepository(read.db).getWithRecords(batchId), clock: read.clock, timeZone: read.timeZone });
}

export async function batchViews(read: Read, lineId: string): Promise<BatchView[]> {
  const heads = await deliveryBatchRepository(read.db).listByOrderLine(lineId);
  const views = await Promise.all(heads.map((head) => batchView(read, head.id)));
  return views.sort((left, right) => left.seq - right.seq);
}

function viewOf({ loaded, clock, timeZone }: { readonly loaded: Loaded; readonly clock: Clock; readonly timeZone: string }): BatchView {
  const received = activeQty(loaded.receipts);
  return {
    ...headOf(loaded),
    shipments: loaded.shipments.map(shipmentView),
    receipts: loaded.receipts.map(receiptView),
    deliveryNote: loaded.deliveryNote === null ? null : noteView(loaded.deliveryNote),
    fulfillment: batchFulfillment(loaded),
    shippedQty: activeQty(loaded.shipments),
    receivedQty: received,
    qtyVariance: varianceOf(loaded, received),
    noteStatus: noteStatus(loaded.deliveryNote),
    overdueDays: overdueDays(loaded.batch, clock.today()),
    daysInStage: daysInStage({ stageChangedAt: loaded.batch.statusChangedAt, today: clock.today(), timeZone }),
    dateChanges: loaded.dateChanges.map(changeView).sort((left, right) => right.changedAt.localeCompare(left.changedAt)),
  };
}

function headOf(loaded: Loaded) {
  const batch = loaded.batch;
  return {
    id: batch.id,
    orderLineId: batch.orderLineId,
    seq: batch.seq,
    plannedQty: batch.plannedQty,
    receiverPartyId: batch.receiverPartyId,
    dateFactoryRequired: batch.dateFactoryRequired,
    dateSupplierPromised: batch.dateSupplierPromised,
    dateBuyerConfirmed: batch.dateBuyerConfirmed,
    firstConfirmedDate: batch.firstConfirmedDate,
    confirmedBy: batch.confirmedBy,
    confirmedAt: batch.confirmedAt,
    status: batch.status,
    statusChangedAt: batch.statusChangedAt,
    origin: batch.origin,
    originRef: batch.originRef,
    closedAt: batch.closedAt,
    closedReason: batch.closedReason,
    cancelledAt: batch.cancelledAt,
    cancelReason: batch.cancelReason,
  };
}

function varianceOf(loaded: Loaded, received: number | null): number | null {
  if (received === null) return null;
  return qtyVariance({ plannedQty: loaded.batch.plannedQty, receipts: loaded.receipts });
}

function activeQty(rows: readonly { readonly qty: number; readonly voidedAt: string | null; readonly fulfillment?: FulfillmentEvidence | null }[]): number | null {
  return sumPresent(rows.filter(countsInRecordedQuantity).map((row) => row.qty));
}

function shipmentView(row: Loaded['shipments'][number]): ShipmentView {
  return { id: row.id, batchId: row.batchId, qty: row.qty, shippedOn: row.shippedOn, source: row.source, fulfillment: row.fulfillment ?? null, recordedAt: row.createdAt, factoryShipmentRowId: row.factoryShipmentRowId, note: row.note, createdBy: row.createdBy, voidedAt: row.voidedAt, voidedBy: row.voidedBy, voidReason: row.voidReason };
}

function receiptView(row: Loaded['receipts'][number]): ReceiptView {
  return { id: row.id, batchId: row.batchId, qty: row.qty, receivedOn: row.receivedOn, category: row.category, source: row.source, fulfillment: row.fulfillment ?? null, recordedAt: row.createdAt, note: row.note, createdBy: row.createdBy, voidedAt: row.voidedAt, voidedBy: row.voidedBy, voidReason: row.voidReason };
}

function noteView(row: NonNullable<Loaded['deliveryNote']>): DeliveryNoteView {
  return { id: row.id, batchId: row.batchId, status: row.status, returnedOn: row.returnedOn, verifiedOn: row.verifiedOn, fileId: row.fileId, note: row.note, createdBy: row.createdBy, voidedAt: row.voidedAt, voidedBy: row.voidedBy, voidReason: row.voidReason };
}

function changeView(row: Loaded['dateChanges'][number]): DateChangeView {
  return { id: row.id, batchId: row.batchId, field: row.field, oldValue: row.oldValue, newValue: row.newValue, reason: row.reason, changedBy: row.changedBy, changedAt: row.changedAt };
}
