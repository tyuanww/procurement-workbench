import { can, normalizeUnit } from '@sw/domain';
import type { Actor } from '../../shared/actor.js';
import { firstBatchReadiness, isOpenForFirstBatch } from '../../shared/first-batch.js';
import type { GetTodayDeps } from '../boundary.js';
import { filterTodosForUser, projectTodos } from '../policies/index.js';
import { arrivalMemos } from '../policies/arrival-memos.js';
import type { PendingBatchRow, PendingBatchSource, TodayQuery, TodoBatchSource } from '../views.js';

export async function load({ deps, input, actor, isInbox = false }: { readonly deps: GetTodayDeps; readonly input: TodayQuery; readonly actor: Actor; readonly isInbox?: boolean }) {
  const now = deps.clock.now();
  const asOf = deps.clock.today();
  const settings = await deps.settings.get();
  const scope = isInbox ? 'mine' : input.scope;
  const pendingScope: TodayQuery['scope'] = scope === 'all' && can(actor, 'dashboard.read') ? 'all' : 'mine';
  const [catalog, exceptions, reviewCounts, uncommittedImports, candidates] = await Promise.all([
    deps.today.loadCatalog(asOf),
    deps.today.loadOpenExceptions(),
    deps.today.loadReviewCounts(),
    deps.today.loadUncommittedImports(actor.id),
    input.includePending === true ? deps.today.loadPendingBatch(pendingScope === 'mine' ? actor.id : null) : undefined,
  ]);
  const available = isInbox ? catalog.sources.filter((batch) => !batch.isLineCancelled) : catalog.sources;
  const sources = available.map((batch) => visibleReminder({ batch, actor, scope: pendingScope }));
  const visibleExceptions = isInbox ? exceptions.filter((row) => row.lineOwnerUserId == null || row.lineOwnerUserId === actor.id) : exceptions;
  const projected = filterTodosForUser({
    todos: projectTodos({ input: { batches: sources, exceptions: visibleExceptions, reviewCounts, uncommittedImports }, today: asOf, now, settings }),
    actor, scope,
  });
  const lines = indexById(catalog.lines);
  const batches = indexById(catalog.batches);
  const names = new Map(catalog.parties.map((party) => [party.id, party.displayName]));
  const pending = candidates === undefined ? undefined : pendingBatch({ candidates, actor, scope: pendingScope, warehouseId: settings.ownWarehousePartyId });
  return { asOf, now, settings, catalog, sources, exceptions: visibleExceptions, pending, projected, lines, batches, names, actor, scope };
}

function visibleReminder({ batch, actor, scope }: { readonly batch: TodoBatchSource; readonly actor: Actor; readonly scope: TodayQuery['scope'] }): TodoBatchSource {
  const { nextFollowUpAt, ...fields } = batch;
  if (nextFollowUpAt === undefined || scope === 'all' || batch.ownerUserId === actor.id) return batch;
  return fields;
}

export type TodayRead = Awaited<ReturnType<typeof load>>;

export function readArrivals(read: TodayRead) {
  const { catalog, batches, actor, scope, asOf, lines, names } = read;
  return arrivalMemos({ sources: catalog.sources, batches, actor, scope, today: asOf, lines, names });
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

function indexById<T extends { readonly id: string }>(rows: readonly T[]): ReadonlyMap<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}
