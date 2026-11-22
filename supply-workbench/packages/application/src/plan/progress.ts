import type { LocalDate } from '../../../domain/src/values/local-date.js';
import type { WorkItemView } from './views.js';

export type ProjectProgressGroup = {
  readonly key: string;
  readonly label: string;
  readonly total: number;
  readonly done: number;
  readonly overdue: number;
  readonly blocked: number;
  readonly completionRate: number | null;
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
};

export function projectProgress(input: {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly today: LocalDate;
  readonly items: readonly WorkItemView[];
}): ProjectProgressView {
  const items = input.items;
  return {
    from: input.from,
    to: input.to,
    ...overall(items, input.today),
    byOwner: groups({ items, keyOf: (item) => item.ownerUserId ?? 'unassigned', labelOf: (item) => item.ownerName ?? '未分配', today: input.today }),
    bySupplier: groups({ items, keyOf: (item) => item.supplierPartyId ?? 'unlinked', labelOf: (item) => item.supplierName ?? '未关联供应商', today: input.today }),
    byFactory: groups({ items, keyOf: (item) => item.factoryPartyId ?? 'unlinked', labelOf: (item) => item.factoryName ?? '未关联工厂', today: input.today }),
  };
}

function overall(items: readonly WorkItemView[], today: LocalDate): Pick<ProjectProgressView, 'total' | 'done' | 'overdue' | 'blocked' | 'completionRate'> {
  const total = items.length;
  const done = items.filter((item) => item.status === 'done').length;
  return {
    total,
    done,
    overdue: items.filter((item) => isOverdue(item, today)).length,
    blocked: items.filter((item) => item.status === 'blocked').length,
    completionRate: rate(done, total),
  };
}

function groups(input: {
  readonly items: readonly WorkItemView[];
  readonly keyOf: (item: WorkItemView) => string;
  readonly labelOf: (item: WorkItemView) => string;
  readonly today: LocalDate;
}): readonly ProjectProgressGroup[] {
  const buckets = new Map<string, { label: string; items: WorkItemView[] }>();
  for (const item of input.items) {
    const key = input.keyOf(item);
    const bucket = buckets.get(key) ?? { label: input.labelOf(item), items: [] };
    bucket.items.push(item);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, bucket]) => ({ key, label: bucket.label, ...overall(bucket.items, input.today) }))
    .sort((left, right) => right.overdue - left.overdue || right.total - left.total || left.key.localeCompare(right.key));
}

function isOverdue(item: WorkItemView, today: LocalDate): boolean {
  return item.status !== 'done' && item.status !== 'cancelled' && item.plannedEnd < today;
}

function rate(done: number, total: number): number | null {
  return total === 0 ? null : done / total;
}
