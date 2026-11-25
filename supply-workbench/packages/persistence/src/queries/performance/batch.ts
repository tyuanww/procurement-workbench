import { BATCH_STATUSES, LANES, countsInRecordedQuantity, isOpenBatch, localDate, type Lane, type LocalDate } from '@sw/domain';
import { entityId, entityIdOrNull } from '../../mappers/id.js';
import { instant, instantOrNull } from '../../mappers/time.js';
import { deliveryBatches, deliveryNotes, orderLines, purchaseOrders, receipts, shipments } from '../../schema/orders.js';
import { batchFulfillmentOf, batchNoteStatus } from '../batch-delivery.js';

type BatchInput = {
  readonly row: typeof deliveryBatches.$inferSelect;
  readonly lines: Map<string, typeof orderLines.$inferSelect>;
  readonly orders: Map<string, typeof purchaseOrders.$inferSelect>;
  readonly receiptRows: readonly (typeof receipts.$inferSelect)[];
  readonly shipmentRows: readonly (typeof shipments.$inferSelect)[];
  readonly noteRows: readonly (typeof deliveryNotes.$inferSelect)[];
  readonly lane: Lane | undefined;
};

export function toBatch(input: BatchInput) {
  return toBatchFacts(input).map(({ kpi }) => kpi);
}

export function toBatchFacts(input: BatchInput & { readonly includeBatchDelivery?: boolean }) {
  const line = input.lines.get(input.row.orderLineId);
  const order = line === undefined ? undefined : input.orders.get(line.purchaseOrderId);
  if (line === undefined || order === undefined) return [];
  if (input.lane !== undefined && line.lane !== input.lane) return [];
  return [batchOf({ ...input, line, order })];
}

function batchOf(input: {
  readonly row: typeof deliveryBatches.$inferSelect;
  readonly line: typeof orderLines.$inferSelect;
  readonly order: typeof purchaseOrders.$inferSelect;
  readonly receiptRows: readonly (typeof receipts.$inferSelect)[];
  readonly shipmentRows: readonly (typeof shipments.$inferSelect)[];
  readonly noteRows: readonly (typeof deliveryNotes.$inferSelect)[];
  readonly includeBatchDelivery?: boolean;
}) {
  const { row, line, order } = input;
  const sent = input.shipmentRows.filter((item) => item.batchId === row.id);
  const received = input.receiptRows.filter((item) => item.batchId === row.id);
  const notes = input.noteRows.filter((item) => item.batchId === row.id);
  const status = oneOf({ values: BATCH_STATUSES, value: row.status, label: '批次状态' });
  return {
    kpi: {
      id: entityId(row.id),
      status,
      lane: oneOf({ values: LANES, value: line.lane, label: '线路' }),
      firstConfirmedDate: dateOrNull(row.firstConfirmedDate),
      dateBuyerConfirmed: dateOrNull(row.dateBuyerConfirmed),
      statusChangedAt: instant(row.statusChangedAt),
      cancelledAt: instantOrNull(row.cancelledAt),
      closedAt: instantOrNull(row.closedAt),
      buyerUserId: entityIdOrNull(line.buyerUserId),
      supplierPartyId: entityIdOrNull(order.supplierPartyId),
      receiverPartyId: entityId(row.receiverPartyId),
      receipts: received.filter(countsInRecordedQuantity).map((item) => ({ receivedOn: localDate(item.receivedOn), voidedAt: instantOrNull(item.voidedAt) })),
      shipments: sent.filter(countsInRecordedQuantity).map((item) => ({ shippedOn: localDate(item.shippedOn), voidedAt: instantOrNull(item.voidedAt) })),
      noteReturnedOn: noteOf(notes),
    },
    delivery: input.includeBatchDelivery === true && isOpenBatch(status) ? {
      fulfillment: batchFulfillmentOf({ batch: row, sent, received }),
      noteStatus: batchNoteStatus(notes),
      isLineCancelled: line.cancelledAt !== null,
    } : undefined,
  };
}

function noteOf(rows: readonly (typeof deliveryNotes.$inferSelect)[]): LocalDate | null {
  const active = rows.find((row) => row.voidedAt === null && row.returnedOn !== null);
  return active?.returnedOn === undefined || active.returnedOn === null ? null : localDate(active.returnedOn);
}

function dateOrNull(value: string | null): LocalDate | null {
  return value === null ? null : localDate(value);
}

function oneOf<T extends string>({ values, value, label }: { readonly values: readonly T[]; readonly value: string; readonly label: string }): T {
  for (const item of values) if (item === value) return item;
  throw new Error(`认不出的${label}: ${value}`);
}
