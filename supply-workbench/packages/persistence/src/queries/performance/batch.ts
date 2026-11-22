import { BATCH_STATUSES, LANES, countsInRecordedQuantity, localDate, type Lane, type LocalDate } from '@sw/domain';
import { entityId, entityIdOrNull } from '../../mappers/id.js';
import { instant, instantOrNull } from '../../mappers/time.js';
import { deliveryBatches, deliveryNotes, orderLines, purchaseOrders, receipts, shipments } from '../../schema/orders.js';

export function toBatch(input: {
  readonly row: typeof deliveryBatches.$inferSelect;
  readonly lines: Map<string, typeof orderLines.$inferSelect>;
  readonly orders: Map<string, typeof purchaseOrders.$inferSelect>;
  readonly receiptRows: readonly (typeof receipts.$inferSelect)[];
  readonly shipmentRows: readonly (typeof shipments.$inferSelect)[];
  readonly noteRows: readonly (typeof deliveryNotes.$inferSelect)[];
  readonly lane: Lane | undefined;
}) {
  const line = input.lines.get(input.row.orderLineId);
  const order = line === undefined ? undefined : input.orders.get(line.purchaseOrderId);
  if (line === undefined || order === undefined) return [];
  if (input.lane !== undefined && line.lane !== input.lane) return [];
  return [batchOf({ row: input.row, line, order, receiptRows: input.receiptRows, shipmentRows: input.shipmentRows, noteRows: input.noteRows })];
}

function batchOf(input: {
  readonly row: typeof deliveryBatches.$inferSelect;
  readonly line: typeof orderLines.$inferSelect;
  readonly order: typeof purchaseOrders.$inferSelect;
  readonly receiptRows: readonly (typeof receipts.$inferSelect)[];
  readonly shipmentRows: readonly (typeof shipments.$inferSelect)[];
  readonly noteRows: readonly (typeof deliveryNotes.$inferSelect)[];
}) {
  const { row, line, order } = input;
  return {
    id: entityId(row.id),
    status: oneOf({ values: BATCH_STATUSES, value: row.status, label: '批次状态' }),
    lane: oneOf({ values: LANES, value: line.lane, label: '线路' }),
    firstConfirmedDate: dateOrNull(row.firstConfirmedDate),
    dateBuyerConfirmed: dateOrNull(row.dateBuyerConfirmed),
    statusChangedAt: instant(row.statusChangedAt),
    cancelledAt: instantOrNull(row.cancelledAt),
    closedAt: instantOrNull(row.closedAt),
    buyerUserId: entityIdOrNull(line.buyerUserId),
    supplierPartyId: entityIdOrNull(order.supplierPartyId),
    receiverPartyId: entityId(row.receiverPartyId),
    receipts: input.receiptRows.filter((item) => item.batchId === row.id && countsInRecordedQuantity(item)).map((item) => ({ receivedOn: localDate(item.receivedOn), voidedAt: instantOrNull(item.voidedAt) })),
    shipments: input.shipmentRows.filter((item) => item.batchId === row.id && countsInRecordedQuantity(item)).map((item) => ({ shippedOn: localDate(item.shippedOn), voidedAt: instantOrNull(item.voidedAt) })),
    noteReturnedOn: noteOf(input.noteRows.filter((item) => item.batchId === row.id)),
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
