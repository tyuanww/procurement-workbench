import { hasWorkItemDependencyConflict } from '@sw/domain';
import type { GetSchedule, GetScheduleDeps } from '../boundary.js';
import { filterCounterparty } from '../policies/filters.js';
import { annotateOverdue } from '../policies/overdue.js';
import type { IncomingWorkItemDependency, WorkItemDependencyConflicts, WorkItemPredecessor, WorkItemView } from '../views.js';

export const makeGetSchedule =
  (deps: GetScheduleDeps): GetSchedule =>
  async (input) => {
    const candidates = await deps.plan.scheduleItems(input);
    const items = annotateOverdue(filterCounterparty(candidates, input), deps.clock.today());
    const dependencies = await deps.plan.incomingDependencies(items.map((item) => item.id));
    return {
      from: input.from, to: input.to, total: items.length, items,
      dependencyConflicts: conflictsOf(items, dependencies),
    };
  };

function conflictsOf(items: readonly WorkItemView[], dependencies: readonly IncomingWorkItemDependency[]): WorkItemDependencyConflicts {
  const statuses = new Map(items.map((item) => [item.id, item.status]));
  const conflicts = new Map<string, WorkItemPredecessor[]>();
  for (const { kind, toItemId, predecessor } of dependencies) {
    const successorStatus = statuses.get(toItemId);
    if (predecessor === null || successorStatus === undefined) continue;
    if (!hasWorkItemDependencyConflict({ kind, predecessorStatus: predecessor.status, successorStatus })) continue;
    const current = conflicts.get(toItemId) ?? [];
    current.push(predecessor);
    conflicts.set(toItemId, current);
  }
  return Object.fromEntries(conflicts);
}
