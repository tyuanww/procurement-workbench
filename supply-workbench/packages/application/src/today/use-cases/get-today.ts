import { TODO_REASONS, type TodoReason } from '@sw/domain';
import type { Actor } from '../../shared/actor.js';
import type { GetToday, GetTodayDeps } from '../boundary.js';
import { calendarOf, inboxCandidates, inboxFocus, isScheduled, projectInboxes } from '../policies/inboxes.js';
import type { PersonalTodayQuery, PersonalTodayResponse, TodayChaseQuery, TodayChaseRow, TodayFactory, TodayPageQuery, TodayPageResponse, TodayPaging, TodayQuery, TodayResponse, TodoBatchView, TodoItemView, TodoLineView } from '../views.js';
import { load, readArrivals, type TodayRead } from './read-today.js';

const ITEM_LIMIT = 500;
const HIGH_PRIORITY = 2;

export function makeGetToday(deps: GetTodayDeps): GetToday {
  const get = async (input: TodayQuery, actor: Actor): Promise<TodayResponse> => {
    const read = await load({ deps, input, actor });
    const matched = matchReasons(read.projected, input.reasons);
    return responseOf({ read, matched, shown: matched.slice(0, ITEM_LIMIT) });
  };
  return Object.assign(get, {
    page: async (input: TodayPageQuery, actor: Actor): Promise<TodayPageResponse> => {
      const read = await load({ deps, input, actor, isInbox: input.inbox !== undefined });
      return pageOf({ read, input, timeZone: deps.timeZone });
    },
    personal: async (input: PersonalTodayQuery, actor: Actor): Promise<PersonalTodayResponse> => {
      const read = await load({ deps, input: { scope: 'mine' }, actor });
      return personalPage({ read, input, timeZone: deps.timeZone });
    },
    chase: async (input: TodayChaseQuery, actor: Actor): Promise<readonly TodayChaseRow[]> => {
      if (input.inbox !== undefined && input.inbox !== 'today') return [];
      const read = await load({ deps, input: { scope: 'mine' }, actor, isInbox: input.inbox !== undefined });
      const items = input.inbox === undefined ? read.projected : inboxCandidates(readInboxes(read), { ...input, inbox: input.inbox });
      const candidates = input.itemId === undefined ? items : items.filter((item) => item.id === input.itemId);
      const { matched } = matchPage({ items: candidates, input, read, timeZone: deps.timeZone });
      return chaseRows({ items: matched, read, factoryId: input.factoryId });
    },
  });
}

type Projected = TodayRead['projected'][number];

function readInboxes(read: TodayRead) {
  return projectInboxes({ projected: read.projected, sources: read.sources, actorId: read.actor.id, memos: readArrivals(read),
    ctx: { today: read.asOf, now: Date.parse(read.now), settings: read.settings } });
}

function showsPending(input: TodayPageQuery, isCurrentDay: boolean): boolean {
  return input.inbox === undefined || (input.inbox === 'today' && input.work === undefined
    && input.reasons === undefined && isCurrentDay && input.sort.kind === 'urgency');
}

function matchReasons(items: readonly Projected[], reasons: TodayQuery['reasons']): readonly Projected[] {
  return reasons === undefined ? items : items.filter((item) => item.reasons.some((reason) => hasReason(reasons, reason)));
}

function selectItems(items: readonly Projected[], { sort, inbox }: Pick<TodayPageQuery, 'sort' | 'inbox'>): readonly Projected[] {
  if (sort.kind === 'urgency') return items;
  return items.flatMap((item) => {
    const remaining = item.remaining;
    if (remaining?.unit !== sort.unit || remaining.unshippedQty === null) return [];
    return [{ item, qty: remaining.unshippedQty }];
  }).sort((left, right) => inbox === 'scheduled' ? 0 : right.qty - left.qty).map(({ item }) => item);
}

function responseOf({ read, matched, shown, memos = readArrivals(read), includePending = true }: {
  readonly read: TodayRead;
  readonly matched: readonly Projected[];
  readonly shown: readonly Projected[];
  readonly memos?: TodayResponse['arrivalMemos'];
  readonly includePending?: boolean;
}): TodayResponse {
  const { asOf, exceptions, pending, lines, batches, names } = read;
  return {
    asOf,
    counts: countsOf(matched),
    items: shown.map((item) => toView({ item, lines, batches, names, exceptions })),
    ...(!includePending || pending === undefined ? {} : { pendingBatch: pending }),
    arrivalMemos: memos,
    truncated: shown.length < matched.length,
  };
}

function pageOf({ read, input, timeZone }: { readonly read: TodayRead; readonly input: TodayPageQuery; readonly timeZone: string }): TodayPageResponse {
  const { items, chaseScope, followUpCounts, extras, memos } = pageScope({ read, input, timeZone });
  const { candidates, matched, reasonCounts, calendar } = matchPage({ items, input, read, timeZone });
  const { number, size } = input.page;
  const page = locatePage({ matched, number, size, focusId: input.focusId });
  const start = (page - 1) * size;
  const shown = matched.slice(start, start + size);
  const chase = chaseSummary({ items: input.inbox === 'scheduled' ? [] : matched, read });
  return {
    ...responseOf({ read, matched, shown, memos: memos(shown), includePending: showsPending(input, calendar === undefined || calendar.date === read.asOf) }),
    truncated: false,
    paging: {
      page, pageSize: size, total: matched.length,
      urgent: matched.filter((item) => item.severity >= HIGH_PRIORITY).length,
      reasonCounts,
      followUpCounts,
      units: comparisonUnits(candidates),
      factories: chase.factories,
      chaseCounts: {
        all: chaseScope.filter((item) => chaseEligibility(item, read) !== null).length,
        filtered: chase.ids.size,
      },
      internalNoteCount: items.filter(isInternalNote).length,
      chaseItemIds: shown.filter((item) => chase.ids.has(item.id)).map((item) => item.id),
      ...(calendar === undefined ? {} : { calendar }),
      ...extras,
    },
  };
}

function pageScope({ read, input, timeZone }: { readonly read: TodayRead; readonly input: TodayPageQuery; readonly timeZone: string }) {
  const { inbox } = input;
  if (inbox === undefined) {
    const counts = countsOf(read.projected);
    return { items: read.projected, chaseScope: read.projected, extras: {}, memos: () => readArrivals(read),
      followUpCounts: { due: counts.follow_up_due, scheduled: counts.follow_up_scheduled } };
  }
  const inboxes = readInboxes(read);
  const { today, scheduled, unassigned } = inboxes.rows;
  const extras: Pick<TodayPaging, 'inboxCounts' | 'pendingCount' | 'focusInbox' | 'focusDay' | 'focusWork'> = {
    inboxCounts: { today: today.length, scheduled: scheduled.length, unassigned: unassigned.length },
    ...(read.pending === undefined ? {} : { pendingCount: read.pending.length }),
    ...inboxFocus({ current: inbox, inboxes, focusId: input.focusId, asOf: read.asOf, timeZone }),
  };
  return {
    items: inboxCandidates(inboxes, { ...input, inbox }), chaseScope: inbox === 'today' ? today : [], extras,
    followUpCounts: { due: today.filter((item) => item.reasons.includes('follow_up_due')).length, scheduled: scheduled.length },
    memos: (shown: readonly Projected[]) => inbox === 'scheduled' ? [] : shown.flatMap((item) => {
      const memo = inboxes.arrivals.get(item.id);
      return memo === undefined ? [] : [memo];
    }),
  };
}

function matchPage({ items, input, read, timeZone }: {
  readonly items: readonly Projected[];
  readonly input: TodayChaseQuery;
  readonly read: TodayRead;
  readonly timeZone: string;
}) {
  const { inbox, reasons, work } = input;
  const workItems = matchWork({ items, work, read });
  const sorted = selectItems(workItems, input);
  const matching = matchReasons(sorted, reasons);
  const candidates = matchReasons(workItems, reasons);
  if (inbox === undefined || input.calendar === undefined) {
    return { candidates, matched: matching, reasonCounts: countsOf(sorted), calendar: undefined };
  }
  const date = input.calendar === 'today' ? read.asOf : input.calendar;
  const dateView = { date, asOf: read.asOf, timeZone };
  const calendar = calendarOf({ ...dateView, candidates: matching });
  const forCounts = reasons === undefined ? calendar.matched : calendarOf({ ...dateView, candidates: sorted }).matched;
  return { candidates, matched: calendar.matched, reasonCounts: countsOf(forCounts), calendar: calendar.view };
}

function personalPage({ read, input, timeZone }: { readonly read: TodayRead; readonly input: PersonalTodayQuery; readonly timeZone: string }): PersonalTodayResponse {
  const owned = read.projected.filter((item) => item.ownerUserId === read.actor.id && item.subject === 'batch' && item.reasons.includes('overdue'));
  const scheduled = owned.filter(isScheduled).length;
  const candidates = input.scope === 'all' ? owned : owned.filter((item) => isScheduled(item) === (input.scope === 'scheduled'));
  const date = input.calendar === 'today' ? read.asOf : input.calendar;
  const calendar = date === undefined ? undefined : calendarOf({ candidates, date, asOf: read.asOf, timeZone });
  const matched = calendar?.matched ?? candidates;
  const page = locatePage({ matched, number: input.page, size: input.pageSize, focusId: input.focusId });
  const start = (page - 1) * input.pageSize;
  return {
    asOf: read.asOf, counts: { pending: owned.length - scheduled, scheduled }, page, pageSize: input.pageSize, total: matched.length,
    items: matched.slice(start, start + input.pageSize).map((item) => toView({ ...read, item })),
    ...(calendar === undefined ? {} : { calendar: calendar.view }),
  };
}

function locatePage({ matched, number, size, focusId }: {
  readonly matched: readonly Projected[];
  readonly number: number;
  readonly size: number;
  readonly focusId: string | undefined;
}): number {
  const index = focusId === undefined ? -1 : matched.findIndex((item) => item.id === focusId);
  return index < 0 ? Math.min(number, Math.max(1, Math.ceil(matched.length / size))) : Math.floor(index / size) + 1;
}

function matchWork({ items, work, read }: { readonly items: readonly Projected[]; readonly work: TodayPageQuery['work']; readonly read: TodayRead }): readonly Projected[] {
  if (work === 'factory_chase') return items.filter((item) => chaseEligibility(item, read) !== null);
  if (work === 'internal_note') return items.filter(isInternalNote);
  if (work === 'all_unshipped') return items.filter((item) => item.ownerUserId === read.actor.id && item.reasons.includes('unshipped') && !isScheduled(item));
  return items;
}

function isInternalNote(item: Projected): boolean {
  return item.subject === 'batch' && item.waitingOn.kind === 'internal' && item.reasons.includes('note_missing');
}

function comparisonUnits(items: readonly Projected[]): string[] {
  return [...new Set(items.flatMap((item) => item.remaining?.unit == null ? [] : [item.remaining.unit]))].sort();
}

type ChaseInput = { readonly items: readonly Projected[]; readonly read: TodayRead };

function chaseRows({ items, read, factoryId }: ChaseInput & { readonly factoryId: string | undefined }): TodayChaseRow[] {
  return items.flatMap((item) => {
    const eligible = chaseEligibility(item, read);
    if (eligible === null || (factoryId !== undefined && eligible.factory.id !== factoryId)) return [];
    return [toChaseRow({ item, eligible, line: lookup(item.refs.orderLineId, read.lines) })];
  });
}

type ChaseEligibility = Pick<TodayChaseRow, 'factory' | 'unshippedQty' | 'unit'>;

function toChaseRow({ item, eligible, line }: { readonly item: Projected; readonly eligible: ChaseEligibility; readonly line: TodoLineView | null }): TodayChaseRow {
  return {
    ...eligible,
    id: item.id, reasons: knownReasons(item.reasons), dueDate: item.dueDate, overdueDays: item.overdueDays,
    poRaw: line?.poRaw ?? null, nameRaw: line?.nameRaw ?? null,
  };
}

function chaseSummary({ items, read }: ChaseInput): { readonly factories: readonly TodayFactory[]; readonly ids: ReadonlySet<string> } {
  const factories = new Map<string, TodayFactory>();
  const ids = new Set<string>();
  for (const item of items) {
    const eligible = chaseEligibility(item, read);
    if (eligible === null) continue;
    ids.add(item.id);
    factories.set(eligible.factory.id, eligible.factory);
  }
  return { ids, factories: [...factories.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id)) };
}

function chaseEligibility(item: Projected, read: TodayRead): ChaseEligibility | null {
  const { remaining, waitingOn, ownerUserId } = item;
  if (remaining === undefined) return null;
  const qty = remaining.unshippedQty;
  if (qty === null || qty <= 0 || ownerUserId !== read.actor.id || waitingOn.kind !== 'supplier' || waitingOn.partyId === null) return null;
  const name = read.names.get(waitingOn.partyId)?.trim();
  if (name == null || name === '') return null;
  return { factory: { id: waitingOn.partyId, name }, unshippedQty: qty, unit: remaining.unit };
}

function toView(input: {
  readonly item: Projected;
  readonly lines: ReadonlyMap<string, TodoLineView>;
  readonly batches: ReadonlyMap<string, TodoBatchView>;
  readonly names: ReadonlyMap<string, string>;
  readonly exceptions: readonly { readonly id: string; readonly type: string; readonly note: string }[];
}): TodoItemView {
  const exception = input.exceptions.find((row) => row.id === input.item.refs.exceptionId);
  const batch = lookup(input.item.refs.batchId, input.batches);
  const { nextFollowUpAt } = input.item;
  return {
    id: input.item.id,
    subject: input.item.subject,
    reasons: knownReasons(input.item.reasons),
    severity: input.item.severity,
    ownerUserId: input.item.ownerUserId,
    waitingOn: input.item.waitingOn,
    dueDate: input.item.dueDate,
    overdueDays: input.item.overdueDays,
    refs: input.item.refs,
    line: lookup(input.item.refs.orderLineId, input.lines),
    batch: batch === null || nextFollowUpAt === undefined ? batch : { ...batch, nextFollowUpAt },
    waitingOnParty: partyOf(input.item.waitingOn.partyId, input.names),
    exception: exception === undefined ? null : { id: exception.id, type: exception.type, note: exception.note },
  };
}

function partyOf(id: string | null, names: ReadonlyMap<string, string>): TodoItemView['waitingOnParty'] {
  return id === null ? null : { id, displayName: names.get(id) ?? null, rawName: null };
}

function lookup<T>(id: string | undefined, rows: ReadonlyMap<string, T>): T | null {
  if (id === undefined) return null;
  return rows.get(id) ?? null;
}

function knownReasons(reasons: readonly string[]): TodoReason[] {
  return reasons.filter((reason): reason is TodoReason => TODO_REASONS.some((item) => item === reason));
}

function hasReason(reasons: readonly TodoReason[] | undefined, reason: string): boolean {
  return reasons?.some((item) => item === reason) ?? false;
}

function countsOf(items: readonly Projected[]): Record<TodoReason, number> {
  const counts = emptyTodoCounts();
  for (const item of items) {
    for (const reason of knownReasons(item.reasons)) counts[reason] += 1;
  }
  return counts;
}

function emptyTodoCounts(): Record<TodoReason, number> {
  return {
    overdue: 0,
    demand_before_confirmed: 0,
    due_today: 0,
    missing_date: 0,
    shipped_not_received: 0,
    note_missing: 0,
    upcoming: 0,
    unshipped: 0,
    fulfillment_review: 0,
    follow_up_due: 0,
    follow_up_scheduled: 0,
    exception_open: 0,
    review_pending: 0,
    import_pending: 0,
    unassigned: 0,
  };
}
