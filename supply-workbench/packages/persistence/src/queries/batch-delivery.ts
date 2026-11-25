import { batchFulfillment, noteStatus } from '@sw/domain';
import type { deliveryBatches, deliveryNotes, receipts, shipments } from '../schema/orders.js';

export function batchFulfillmentOf({ batch, sent, received }: {
  readonly batch: typeof deliveryBatches.$inferSelect;
  readonly sent: readonly (typeof shipments.$inferSelect)[];
  readonly received: readonly (typeof receipts.$inferSelect)[];
}) {
  return batchFulfillment({
    batch: { plannedQty: Number(batch.plannedQty), plannedUnit: batch.plannedUnit },
    shipments: sent.map((row) => ({ ...row, qty: Number(row.qty) })),
    receipts: received.map((row) => ({ ...row, qty: Number(row.qty) })),
  });
}

export function batchNoteStatus(notes: readonly (typeof deliveryNotes.$inferSelect)[]) {
  const row = notes.find((item) => item.voidedAt === null);
  if (row === undefined || row.status === 'missing') return 'missing';
  return noteStatus({ status: row.status === 'verified' ? 'verified' : 'returned', voidedAt: null });
}
