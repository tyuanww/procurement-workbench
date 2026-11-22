import { compareDates, type LocalDate } from '@sw/domain';
import type { Actor } from '../../shared/actor.js';
import type { ArrivalMemo, TodayCatalog, TodoBatchSource, TodayQuery, TodoLineView } from '../views.js';

export function arrivalMemos(input: {
  readonly catalog: TodayCatalog;
  readonly actor: Actor;
  readonly scope: TodayQuery['scope'];
  readonly today: LocalDate;
  readonly lines: ReadonlyMap<string, TodoLineView>;
  readonly names: ReadonlyMap<string, string>;
}): ArrivalMemo[] {
  return input.catalog.sources.flatMap((source) => {
    if (input.scope === 'mine' && source.ownerUserId !== null && source.ownerUserId !== input.actor.id) return [];
    const line = input.lines.get(source.orderLineId);
    if (line === undefined) return [];
    return memoOf({ source, line, today: input.today, warehouse: input.names.get(source.receiverPartyId) ?? null });
  }).sort(byDate);
}

function memoOf({ source, line, today, warehouse }: {
  readonly source: TodoBatchSource;
  readonly line: TodoLineView;
  readonly today: LocalDate;
  readonly warehouse: string | null;
}): ArrivalMemo[] {
  const { inTransitQty, receivedQty, unit } = source.fulfillment;
  if (source.status === 'closed' || source.status === 'cancelled' || inTransitQty === null || inTransitQty <= 0 || receivedQty === null || unit === null) return [];
  const confirmedDate = source.dateBuyerConfirmed;
  return [{ batchId: source.id, line, warehouse, confirmedDate, status: statusOf(confirmedDate, today), inTransitQty, receivedQty, unit }];
}

function statusOf(date: LocalDate | null, today: LocalDate): ArrivalMemo['status'] {
  if (date === today) return 'due_today';
  if (date !== null && compareDates(date, today) < 0) return 'overdue';
  return 'in_transit';
}

function byDate(left: ArrivalMemo, right: ArrivalMemo): number {
  if (left.confirmedDate === null) return right.confirmedDate === null ? 0 : 1;
  if (right.confirmedDate === null) return -1;
  return compareDates(left.confirmedDate, right.confirmedDate);
}
