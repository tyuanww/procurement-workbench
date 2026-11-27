import type { LocalDate } from '../../../domain/src/values/local-date.js';
import { annotateOverdue } from './policies/overdue.js';
import type { SchedulePlanQuery, WorkItemView } from './views.js';

export type ProjectProgressQuery = SchedulePlanQuery & { readonly includeItems?: boolean };

type ProjectProgressTask = { readonly item: WorkItemView; readonly overdue: boolean };

export type ProjectProgressGroup = {
  readonly key: string;
  readonly label: string;
  readonly total: number;
  readonly done: number;
  readonly overdue: number;
  readonly blocked: number;
  readonly completionRate: number | null;
  readonly itemIds?: readonly string[];
};

export type ProjectProgressView = {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly total: number;
  readonly done: number;
  readonly overdue: number;
  readonly blocked: number;
  readonly completionRate: number | null;
  readonly byOwner: readonly ProjectProgressGroup[];
  readonly bySupplier: readonly ProjectProgressGroup[];
  readonly byFactory: readonly ProjectProgressGroup[];
  readonly details?: { readonly asOf: LocalDate; readonly tasks: readonly ProjectProgressTask[] };
};

export function projectProgress(input: {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly today: LocalDate;
  readonly items: readonly WorkItemView[];
  readonly includeItems?: boolean;
}): ProjectProgressView {
  const tasks = annotateOverdue(input.items, input.today).map((item) => ({ item, overdue: item.overdueDays !== null }));
  const scope = { tasks, includeItems: input.includeItems === true };
  return {
    from: input.from,
    to: input.to,
    ...overall(tasks),
    byOwner: groups({ ...scope, keyOf: (item) => item.ownerUserId ?? 'unassigned', labelOf: (item) => item.ownerName ?? '未分配' }),
    bySupplier: groups({ ...scope, keyOf: (item) => item.supplierPartyId ?? 'unlinked', labelOf: (item) => item.supplierName ?? '未关联供应商' }),
    byFactory: groups({ ...scope, keyOf: (item) => item.factoryPartyId ?? 'unlinked', labelOf: (item) => item.factoryName ?? '未关联工厂' }),
    ...(scope.includeItems ? { details: { asOf: input.today, tasks } } : {}),
  };
}

function overall(tasks: readonly ProjectProgressTask[]): Pick<ProjectProgressView, 'total' | 'done' | 'overdue' | 'blocked' | 'completionRate'> {
  const total = tasks.length;
  const done = tasks.filter(({ item }) => item.status === 'done').length;
  return {
    total,
    done,
    overdue: tasks.filter((task) => task.overdue).length,
    blocked: tasks.filter(({ item }) => item.status === 'blocked').length,
    completionRate: rate(done, total),
  };
}

function groups(input: {
  readonly tasks: readonly ProjectProgressTask[];
  readonly keyOf: (item: WorkItemView) => string;
  readonly labelOf: (item: WorkItemView) => string;
  readonly includeItems: boolean;
}): readonly ProjectProgressGroup[] {
  const buckets = new Map<string, { label: string; tasks: ProjectProgressTask[] }>();
  for (const task of input.tasks) {
    const key = input.keyOf(task.item);
    const bucket = buckets.get(key) ?? { label: input.labelOf(task.item), tasks: [] };
    bucket.tasks.push(task);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, { label, tasks }]) => ({ key, label, ...overall(tasks),
      ...(input.includeItems ? { itemIds: tasks.map(({ item }) => item.id) } : {}) }))
    .sort((left, right) => right.overdue - left.overdue || right.total - left.total || left.key.localeCompare(right.key));
}

function rate(done: number, total: number): number | null {
  return total === 0 ? null : done / total;
}
