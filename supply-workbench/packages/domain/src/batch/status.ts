import { countsInRecordedQuantity, roundQuantity, sumQuantities, type FulfillmentEvidence } from './fulfillment.js';
import type { BatchFacts } from '../entities/orders.js';
import type { BatchStatus, NoteStatus } from '../vocabulary/index.js';

type Recorded = { readonly voidedAt?: string | null; readonly fulfillment?: FulfillmentEvidence | null };

export type StatusInput = Omit<BatchFacts, 'receipts' | 'shipments'> & {
  readonly receipts: readonly (BatchFacts['receipts'][number] & Recorded)[];
  readonly shipments: readonly Recorded[];
};

const OPEN_STATUSES = ['awaiting_date', 'confirmed', 'shipped', 'partially_received'] as const;

export function isOpenBatch(status: BatchStatus): boolean {
  return OPEN_STATUSES.some((open) => open === status);
}

export function deriveBatchStatus(facts: StatusInput): BatchStatus {
  if (facts.cancelledAt) return 'cancelled';
  if (facts.closedAt) return 'closed';
  const received = receivedQty(facts.receipts);
  if (received > 0) return received >= roundQuantity(facts.plannedQty) ? 'received' : 'partially_received';
  if (facts.shipments.some(countsInRecordedQuantity)) return 'shipped';
  if (facts.dateBuyerConfirmed) return 'confirmed';
  return 'awaiting_date';
}

export function qtyVariance(facts: Pick<StatusInput, 'plannedQty' | 'receipts'>): number {
  return roundQuantity(receivedQty(facts.receipts) - roundQuantity(facts.plannedQty));
}

export function noteStatus(note: { readonly status: Exclude<NoteStatus, 'missing'>; readonly voidedAt: string | null } | null): NoteStatus {
  if (note === null || note.voidedAt !== null) return 'missing';
  return note.status;
}

function receivedQty(receipts: StatusInput['receipts']): number {
  return sumQuantities(receipts.filter(countsInRecordedQuantity));
}
