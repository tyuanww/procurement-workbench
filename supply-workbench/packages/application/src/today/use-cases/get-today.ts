import { TODO_REASONS, can, normalizeUnit, type TodoReason } from '@sw/domain';
import type { Actor } from '../../shared/actor.js';
import { firstBatchReadiness, isOpenForFirstBatch } from '../../shared/first-batch.js';
import type { GetToday, GetTodayDeps } from '../boundary.js';
import { filterTodosForUser, projectTodos } from '../policies/index.js';
import { arrivalMemos } from '../policies/arrival-memos.js';
import type { PendingBatchRow, PendingBatchSource, TodayChaseQuery, TodayChaseRow, TodayFactory, TodayPageQuery, TodayPageResponse, TodayQuery, TodayResponse, TodoBatchView, TodoItem, TodoItemView, TodoLineView } from '../views.js';

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
      const read = await load({ deps, input, actor });
      return pageOf({ read, input });
    },
    chase: async (input: TodayChaseQuery, actor: Actor): Promise<readonly TodayChaseRow[]> => {
      const read = await load({ deps, input: { scope: 'mine' }, actor });
      const candidates = input.itemId === undefined ? read.projected : read.projected.filter((item) => item.id === input.itemId);
      return chaseRows({ items: selectItems(matchReasons(candidates, input.reasons), input.sort), read, factoryId: input.factoryId });
    },
  });
}

async function load({ deps, input, actor }: { readonly deps: GetTodayDeps; readonly input: TodayQuery; readonly actor: Actor }) {
  const asOf = deps.clock.today();
  const settings = await deps.settings.get();
  const pendingScope: TodayQuery['scope'] = input.scope === 'all' && can(actor, 'dashboard.read') ? 'all' : 'mine';
  const [catalog, exceptions, reviewCounts, uncommittedImports, candidates] = await Promise.all([
    deps.today.loadCatalog(asOf),
    deps.today.loadOpenExceptions(),
    deps.today.loadReviewCounts(),
    deps.today.loadUncommittedImports(actor.id),
    input.includePending === true ? deps.today.loadPendingBatch(pendingScope === 'mine' ? actor.id : null) : undefined,
  ]);
  const projected = filterTodosForUser({ todos: projectTodos({ input: { batches: catalog.sources, exceptions, reviewCounts, uncommittedImports }, today: asOf, settings }), actor, scope: input.scope });
  const lines = indexById(catalog.lines);
  const batches = indexById(catalog.batches);
  const names = new Map(catalog.parties.map((party) => [party.id, party.displayName]));
  return { asOf, catalog, exceptions, candidates, pendingScope, projected, lines, batches, names, actor, scope: input.scope, warehouseId: settings.ownWarehousePartyId };
}

type TodayRead = Awaited<ReturnType<typeof load>>;
type Projected = TodayRead['projected'][number];

function matchReasons(items: readonly Projected[], reasons: TodayQuery['reasons']): readonly Projected[] {
  return reasons === undefined ? items : items.filter((item) => item.reasons.some((reason) => hasReason(reasons, reason)));
}

function selectItems(items: readonly Projected[], sort: TodayPageQuery['sort']): readonly Projected[] {
  if (sort.kind === 'urgency') return items;
  return items.flatMap((item) => {
    const remaining = item.remaining;
    if (remaining?.unit !== sort.unit || remaining.unshippedQty === null) return [];
    return [{ item, qty: remaining.unshippedQty }];
  }).sort((left, right) => right.qty - left.qty).map(({ item }) => item);
}

function responseOf({ read, matched, shown }: {
  readonly read: TodayRead;
  readonly matched: readonly Projected[];
  readonly shown: readonly Projected[];
}): TodayResponse {
  const { asOf, catalog, exceptions, candidates, pendingScope, lines, batches, names, actor, scope, warehouseId } = read;
  return {
    asOf,
    counts: countsOf(matched),
    items: shown.map((item) => toView({ item, lines, batches, names, exceptions })),
    ...(candidates === undefined ? {} : { pendingBatch: pendingBatch({ candidates, actor, scope: pendingScope, warehouseId }) }),
    arrivalMemos: arrivalMemos({ sources: catalog.sources, batches, actor, scope, today: asOf, lines, names }),
    truncated: shown.length < matched.length,
  };
}

function pageOf({ read, input }: { readonly read: TodayRead; readonly input: TodayPageQuery }): TodayPageResponse {
  const candidates = matchReasons(read.projected, input.reasons);
  const matched = selectItems(candidates, input.sort);
  const { number, size } = input.page;
  const total = matched.length;
  const focusIndex = input.focusId === undefined ? -1 : matched.findIndex((item) => item.id === input.focusId);
  const page = focusIndex < 0 ? Math.min(number, Math.max(1, Math.ceil(total / size))) : Math.floor(focusIndex / size) + 1;
  const start = (page - 1) * size;
  const shown = matched.slice(start, start + size);
  const chase = chaseSummary({ items: matched, read });
  return {
    ...responseOf({ read, matched, shown }),
    truncated: false,
    paging: {
      page, pageSize: size, total,
      urgent: matched.filter((item) => item.severity >= HIGH_PRIORITY).length,
      reasonCounts: countsOf(selectItems(read.projected, input.sort)),
      units: comparisonUnits(candidates),
      factories: chase.factories,
      chaseCounts: {
        all: input.reasons === undefined && input.sort.kind === 'urgency' ? chase.ids.size : read.projected.filter((item) => chaseEligibility(item, read) !== null).length,
        filtered: chase.ids.size,
      },
      chaseItemIds: shown.filter((item) => chase.ids.has(item.id)).map((item) => item.id),
    },
  };
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

function pendingBatch({ candidates, actor, scope, warehouseId }: {
  readonly candidates: readonly PendingBatchSource[];
  readonly actor: Actor;
  readonly scope: TodayQuery['scope'];
  readonly warehouseId: string | null;
}): PendingBatchRow[] {
  const canWrite = can(actor, 'lines.write');
  return candidates.flatMap((line) => {
    const isOwner = line.buyerUserId === actor.id;
    if ((scope === 'mine' && !isOwner) || !isOpenForFirstBatch(line, line.reportedStatus)) return [];
    const readiness = firstBatchReadiness({ line, warehouseId: line.receiverIsOwnWarehouse ? warehouseId : null });
    return [{
      orderLineId: line.orderLineId,
      poRaw: line.poRaw,
      nameRaw: line.nameRaw,
      qtyOrdered: line.qtyOrdered,
      unit: normalizeUnit(line.unit),
      missingFields: readiness.kind === 'detail' ? readiness.missingFields : [],
      action: isOwner && canWrite ? readiness.kind : 'detail',
    }];
  });
}

function toView(input: {
  readonly item: Omit<TodoItem, 'reasons'> & { readonly reasons: readonly string[] };
  readonly lines: ReadonlyMap<string, TodoLineView>;
  readonly batches: ReadonlyMap<string, TodoBatchView>;
  readonly names: ReadonlyMap<string, string>;
  readonly exceptions: readonly { readonly id: string; readonly type: string; readonly note: string }[];
}): TodoItemView {
  const exception = input.exceptions.find((row) => row.id === input.item.refs.exceptionId);
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
    batch: lookup(input.item.refs.batchId, input.batches),
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

function indexById<T extends { readonly id: string }>(rows: readonly T[]): ReadonlyMap<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
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
    exception_open: 0,
    review_pending: 0,
    import_pending: 0,
    unassigned: 0,
  };
}
