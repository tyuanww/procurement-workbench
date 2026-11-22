import { addDays, compareDates, diffDays, isOpenBatch, type LocalDate, type Settings, type WaitingOnKind } from '@sw/domain';
import type { TodoBatchSource } from '../views.js';

export type TodoContext = {
  readonly today: LocalDate;
  readonly settings: Settings;
};

export type WaitingOn = {
  readonly kind: WaitingOnKind;
  readonly partyId: string | null;
};

// 02 第 8.1 节规定严重度只有 1、2、3。
export const MID_SEVERITY = 2;
export const HIGH_SEVERITY = 3;

export type TodoRule = {
  readonly reason: string;
  applies(batch: TodoBatchSource, ctx: TodoContext): boolean;
  severity(batch: TodoBatchSource, ctx: TodoContext): 1 | typeof MID_SEVERITY | typeof HIGH_SEVERITY;
  waitingOn(batch: TodoBatchSource): WaitingOn;
};

const supplier = (batch: TodoBatchSource): WaitingOn => ({ kind: 'supplier', partyId: batch.supplierPartyId });
const internal = (): WaitingOn => ({ kind: 'internal', partyId: null });

export const TODO_RULES: readonly TodoRule[] = [
  {
    reason: 'overdue',
    applies: (batch) => hasUnshipped(batch) && batch.overdueDays !== null && batch.overdueDays > 0,
    severity: () => HIGH_SEVERITY,
    waitingOn: supplier,
  },
  {
    reason: 'demand_before_confirmed',
    applies: (batch) => hasUnshipped(batch) && isBefore(batch.dateFactoryRequired, batch.dateBuyerConfirmed),
    severity: () => HIGH_SEVERITY,
    waitingOn: supplier,
  },
  {
    reason: 'due_today',
    applies: (batch, ctx) => hasUnshipped(batch) && batch.dateBuyerConfirmed === ctx.today,
    severity: () => MID_SEVERITY,
    waitingOn: supplier,
  },
  {
    reason: 'missing_date',
    applies: (batch) => hasUnshipped(batch) && batch.dateBuyerConfirmed === null,
    severity: (batch, ctx) => (needsDateSoon(batch, ctx) ? MID_SEVERITY : 1),
    waitingOn: supplier,
  },
  {
    reason: 'note_missing',
    applies: (batch) => isNoteMissing(batch),
    severity: (batch, ctx) => (exceeds(noteAge(batch, ctx.today), ctx.settings.deliveryNoteAlertDays) ? MID_SEVERITY : 1),
    waitingOn: (batch) => hasUnshipped(batch) ? supplier(batch) : internal(),
  },
  {
    reason: 'upcoming',
    applies: (batch, ctx) => hasUnshipped(batch) && isSoon(batch, ctx),
    severity: () => 1,
    waitingOn: supplier,
  },
  { reason: 'unshipped', applies: hasUnshipped, severity: () => 1, waitingOn: supplier },
  {
    reason: 'fulfillment_review',
    applies: (batch) => (isOpenBatch(batch.status) || batch.status === 'received') && (batch.fulfillment.unshippedQty === null || batch.fulfillment.reviewCount > 0),
    severity: () => 1,
    waitingOn: (batch) => hasUnshipped(batch) ? supplier(batch) : internal(),
  },
];

function hasUnshipped(batch: TodoBatchSource): boolean {
  const qty = batch.fulfillment.unshippedQty;
  return !batch.isLineCancelled && isOpenBatch(batch.status) && qty !== null && qty > 0;
}

function isBefore(earlier: LocalDate | null, later: LocalDate | null): boolean {
  if (earlier === null || later === null) return false;
  return compareDates(earlier, later) < 0;
}

function needsDateSoon(batch: TodoBatchSource, ctx: TodoContext): boolean {
  if (batch.earliestHintDate === null) return true;
  const limit = addDays(ctx.today, ctx.settings.missingDateHintWindowDays);
  return compareDates(batch.earliestHintDate, limit) <= 0;
}

function isSoon(batch: TodoBatchSource, ctx: TodoContext): boolean {
  if (batch.dateBuyerConfirmed === null) return false;
  const ahead = diffDays(batch.dateBuyerConfirmed, ctx.today);
  return ahead > 0 && ahead <= ctx.settings.upcomingDays;
}

function isNoteMissing(batch: TodoBatchSource): boolean {
  return batch.noteStatus === 'missing' && (batch.status === 'shipped' || batch.status === 'partially_received' || batch.status === 'received');
}

function lastShipped(batch: TodoBatchSource): LocalDate | null {
  return latest(batch.shipments.map((row) => row.shippedOn));
}

function noteAge(batch: TodoBatchSource, today: LocalDate): number | null {
  const date = batch.status === 'received' ? latest(batch.receipts.map((row) => row.receivedOn)) : lastShipped(batch);
  return daysSince(date, today);
}

function latest(dates: readonly LocalDate[]): LocalDate | null {
  return dates.reduce<LocalDate | null>((current, date) => (current === null || compareDates(date, current) > 0 ? date : current), null);
}

function daysSince(date: LocalDate | null, today: LocalDate): number | null {
  if (date === null) return null;
  return diffDays(today, date);
}

function exceeds(days: number | null, limit: number | null): boolean {
  return days !== null && limit !== null && days > limit;
}
