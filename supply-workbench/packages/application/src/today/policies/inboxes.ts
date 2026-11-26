import { businessDay, isOpenBatch, type LocalDate } from '@sw/domain';
import type { ArrivalMemo, TodayInbox, TodayPageQuery, TodayPaging, TodoBatchSource } from '../views.js';
import { byUrgency, projectBatch, type ProjectedTodo } from './project-todos.js';
import { HIGH_SEVERITY, MID_SEVERITY, TODO_RULES, type TodoContext, type TodoRule } from './rules.js';

const INTERNAL_RULES: readonly TodoRule[] = TODO_RULES
  .filter(({ reason }) => reason === 'note_missing' || reason === 'fulfillment_review')
  .map((rule) => ({ ...rule, waitingOn: () => ({ kind: 'internal', partyId: null }) }));
const DATE_MONTH_PREFIX_LENGTH = 7;

export type Inboxes = {
  readonly rows: Readonly<Record<TodayInbox, readonly ProjectedTodo[]>>;
  readonly allUnshipped: readonly ProjectedTodo[];
  readonly arrivals: ReadonlyMap<string, ArrivalMemo>;
};

export function projectInboxes({ projected, sources, memos, actorId, ctx }: {
  readonly projected: readonly ProjectedTodo[];
  readonly sources: readonly TodoBatchSource[];
  readonly memos: readonly ArrivalMemo[];
  readonly actorId: string;
  readonly ctx: TodoContext;
}): Inboxes {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const today = new Map<string, ProjectedTodo>();
  const unassigned = new Map<string, ProjectedTodo>();
  const scheduled: ProjectedTodo[] = [];
  const unscheduledUnshipped: ProjectedTodo[] = [];
  for (const item of projected) {
    if (item.ownerUserId === null) unassigned.set(item.id, item);
    if (item.ownerUserId !== actorId) continue;
    if (isScheduled(item)) scheduled.push(item);
    else if (item.reasons.includes('unshipped')) unscheduledUnshipped.push(item);
    const source = item.refs.batchId === undefined ? undefined : sourceById.get(item.refs.batchId);
    const due = dueActions({ item, source, ctx });
    if (due !== undefined) today.set(item.id, due);
  }
  const arrivals = mergeReceipts({ today, unassigned, memos, sourceById, actorId });
  return {
    rows: { today: [...today.values()].sort(byUrgency), scheduled: scheduled.sort(byReminder), unassigned: [...unassigned.values()].sort(byUrgency) },
    allUnshipped: unscheduledUnshipped.map((item) => arrivals.has(item.id) ? today.get(item.id) ?? item : item).sort(byUrgency),
    arrivals,
  };
}

function dueActions({ item, source, ctx }: {
  readonly item: ProjectedTodo;
  readonly source: TodoBatchSource | undefined;
  readonly ctx: TodoContext;
}): ProjectedTodo | undefined {
  if (item.subject !== 'batch' || source === undefined) return item;
  if (!isScheduled(item) && item.reasons.some(isFollowUpNeeded)) return item;
  const [internal] = projectBatch({ batch: source, ctx, rules: INTERNAL_RULES });
  return internal === undefined ? undefined : withReminder(internal, item.nextFollowUpAt);
}

function isFollowUpNeeded(reason: string): boolean {
  return reason !== 'unshipped' && !INTERNAL_RULES.some((rule) => rule.reason === reason);
}

export function isScheduled(item: ProjectedTodo): boolean {
  return item.reasons.includes('follow_up_scheduled');
}

export function inboxCandidates(inboxes: Inboxes, input: Pick<TodayPageQuery, 'work'> & { readonly inbox: TodayInbox }): readonly ProjectedTodo[] {
  return input.inbox === 'today' && input.work === 'all_unshipped' ? inboxes.allUnshipped : inboxes.rows[input.inbox];
}

export function inboxFocus({ current, inboxes, focusId, asOf, timeZone }: {
  readonly current: TodayInbox;
  readonly inboxes: Inboxes;
  readonly focusId: string | undefined;
  readonly asOf: LocalDate;
  readonly timeZone: string;
}): Pick<TodayPaging, 'focusInbox' | 'focusDay' | 'focusWork'> {
  if (focusId === undefined) return {};
  const order: readonly TodayInbox[] = [current, 'today', 'scheduled', 'unassigned'];
  for (const inbox of new Set(order)) {
    const found = inboxes.rows[inbox].find((item) => item.id === focusId);
    if (found !== undefined) return { focusInbox: inbox, focusDay: actionDay({ item: found, asOf, timeZone }) };
  }
  return inboxes.allUnshipped.some((item) => item.id === focusId) ? { focusInbox: 'today', focusDay: asOf, focusWork: 'all_unshipped' } : {};
}

export function calendarOf({ candidates, date, asOf, timeZone }: {
  readonly candidates: readonly ProjectedTodo[];
  readonly date: LocalDate;
  readonly asOf: LocalDate;
  readonly timeZone: string;
}) {
  const month = date.slice(0, DATE_MONTH_PREFIX_LENGTH);
  const days = new Map<LocalDate, number>();
  const matched: ProjectedTodo[] = [];
  for (const item of candidates) {
    const day = actionDay({ item, asOf, timeZone });
    if (day.startsWith(month)) {
      const count = days.get(day);
      days.set(day, count === undefined ? 1 : count + 1);
    }
    if (day === date) matched.push(item);
  }
  return { matched, view: { date, days: [...days].map(([day, count]) => ({ date: day, count })) } };
}

function actionDay({ item, asOf, timeZone }: { readonly item: ProjectedTodo; readonly asOf: LocalDate; readonly timeZone: string }): LocalDate {
  return isScheduled(item) && item.nextFollowUpAt !== undefined ? businessDay(item.nextFollowUpAt, timeZone) : asOf;
}

function byReminder(left: ProjectedTodo, right: ProjectedTodo): number {
  const time = Date.parse(left.nextFollowUpAt ?? '') - Date.parse(right.nextFollowUpAt ?? '');
  return time || byUrgency(left, right);
}

function withReminder(item: ProjectedTodo, nextFollowUpAt: string | undefined): ProjectedTodo {
  return nextFollowUpAt === undefined ? item : { ...item, nextFollowUpAt };
}

function mergeReceipts({ today, unassigned, memos, sourceById, actorId }: {
  readonly today: Map<string, ProjectedTodo>;
  readonly unassigned: Map<string, ProjectedTodo>;
  readonly memos: readonly ArrivalMemo[];
  readonly sourceById: ReadonlyMap<string, TodoBatchSource>;
  readonly actorId: string;
}): ReadonlyMap<string, ArrivalMemo> {
  const arrivals = new Map<string, ArrivalMemo>();
  for (const memo of memos) {
    const source = sourceById.get(memo.batchId);
    if (source === undefined || source.isLineCancelled || !isOpenBatch(source.status) || memo.status === 'in_transit') continue;
    const rows = source.ownerUserId === null ? unassigned : source.ownerUserId === actorId ? today : null;
    if (rows === null) continue;
    const id = `batch:${memo.batchId}`;
    rows.set(id, receiptItem({ memo, source, previous: rows.get(id), id }));
    arrivals.set(id, memo);
  }
  return arrivals;
}

function receiptItem({ memo, source, previous, id }: {
  readonly memo: ArrivalMemo;
  readonly source: TodoBatchSource;
  readonly previous: ProjectedTodo | undefined;
  readonly id: string;
}): ProjectedTodo {
  const severity = memo.status === 'overdue' ? HIGH_SEVERITY : MID_SEVERITY;
  if (previous !== undefined) {
    return { ...previous, reasons: [...previous.reasons, 'shipped_not_received'], severity: previous.severity >= severity ? previous.severity : severity };
  }
  return withReminder({
    id, subject: 'batch', ownerUserId: source.ownerUserId, severity,
    reasons: source.ownerUserId === null ? ['shipped_not_received', 'unassigned'] : ['shipped_not_received'],
    waitingOn: { kind: 'receiver', partyId: source.receiverPartyId },
    dueDate: memo.confirmedDate, overdueDays: source.overdueDays,
    refs: { orderLineId: source.orderLineId, batchId: source.id },
  }, source.nextFollowUpAt);
}
