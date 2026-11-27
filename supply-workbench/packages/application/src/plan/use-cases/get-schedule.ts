import { hasWorkItemDependencyConflict } from '@sw/domain';
import { authorize } from '../../shared/authorize.js';
import type { GetSchedule, GetScheduleDeps } from '../boundary.js';
import { filterCounterparty } from '../policies/filters.js';
import { annotateOverdue } from '../policies/overdue.js';
import type { IncomingWorkItemDependency, WorkItemDependencyConflicts, WorkItemPredecessor, WorkItemView } from '../views.js';

export const makeGetSchedule =
  (deps: GetScheduleDeps): GetSchedule =>
  async (input, actor) => {
    if (input.includeDelivery === true) authorize(actor, 'data.read');
    const today = deps.clock.today();
    const [candidates, deliveryBatches] = await Promise.all([
      deps.plan.scheduleItems(input),
      input.includeDelivery === true ? deps.plan.deliverySchedule({ ...input, today }) : undefined,
    ]);
    const items = annotateOverdue(filterCounterparty(candidates, input), today);
    const deliveryItems = deliveryBatches === undefined ? []
      : await deps.plan.deliveryTasks(deliveryBatches.map((batch) => batch.id));
    const dependencies = await deps.plan.incomingDependencies([...new Set([...items, ...deliveryItems].map((item) => item.id))]);
    const deliveryConflicts = conflictsOf(deliveryItems, dependencies);
    const deliveryPredecessors = predecessorsOf(deliveryItems, dependencies);
    return {
      from: input.from, to: input.to, total: items.length, items,
      dependencyConflicts: conflictsOf(items, dependencies),
      ...(deliveryBatches === undefined ? {} : {
        deliveryBatches,
        deliveryTasks: deliveryItems.map((task) => ({ task, dependencies: deliveryPredecessors.get(task.id) ?? [], conflicts: deliveryConflicts[task.id] ?? [] })),
      }),
    };
  };

function predecessorsOf(items: readonly WorkItemView[], edges: readonly IncomingWorkItemDependency[]) {
  const itemIds = new Set(items.map((item) => item.id));
  const predecessors = new Map<string, WorkItemPredecessor[]>();
  for (const { toItemId, predecessor } of edges) {
    if (predecessor === null || !itemIds.has(toItemId)) continue;
    const list = predecessors.get(toItemId);
    if (list === undefined) predecessors.set(toItemId, [predecessor]);
    else list.push(predecessor);
  }
  return predecessors;
}

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
