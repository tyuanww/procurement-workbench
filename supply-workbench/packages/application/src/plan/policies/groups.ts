import type { LocalDate } from '../../../../domain/src/values/local-date.js';
import type { DailyPlanView, PlanGroupView, WorkItemView } from '../views.js';

const UNASSIGNED = 'unassigned';

export function groupDailyPlan(input: { readonly date: LocalDate; readonly today: LocalDate; readonly items: readonly WorkItemView[] }): DailyPlanView {
  return {
    date: input.date,
    asOf: input.today,
    total: input.items.length,
    overdueCount: input.items.filter((item) => item.overdueDays !== null).length,
    items: input.items,
    byOwner: grouped({ items: input.items, keyOf: (item) => item.ownerUserId, labelOf: (item) => item.ownerName, fallback: '未分配' }),
    bySupplier: grouped({ items: input.items, keyOf: (item) => item.supplierPartyId, labelOf: (item) => item.supplierName, fallback: '未指定供应商' }),
    byFactory: grouped({ items: input.items, keyOf: (item) => item.factoryPartyId, labelOf: (item) => item.factoryName, fallback: '未指定工厂' }),
  };
}

function grouped(input: {
  readonly items: readonly WorkItemView[];
  readonly keyOf: (item: WorkItemView) => string | null;
  readonly labelOf: (item: WorkItemView) => string | null;
  readonly fallback: string;
}): readonly PlanGroupView[] {
  const groups = new Map<string, { label: string | null; items: WorkItemView[] }>();
  for (const item of input.items) {
    const key = input.keyOf(item) ?? UNASSIGNED;
    const current = groups.get(key) ?? { label: input.keyOf(item) === null ? input.fallback : input.labelOf(item), items: [] };
    current.items.push(item);
    groups.set(key, current);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, label: group.label, items: group.items }));
}
