import type { DailyPlan, PlanRow, WorkItem } from '../../features/today/index.js';

export type ScheduleFilter = 'overdue' | 'today' | 'blocked';

export function readScheduleFilter(params: URLSearchParams): ScheduleFilter | undefined {
  const value = params.get('planFilter');
  return value === 'overdue' || value === 'today' || value === 'blocked' ? value : undefined;
}

export function matchesScheduleFilter(row: PlanRow, filter: ScheduleFilter | undefined): boolean {
  if (row.status === 'done' || row.status === 'cancelled' || row.timing === null) return false;
  if (filter === undefined) return true;
  return filter === 'blocked' ? row.status === 'blocked' : row.timing === filter;
}

export function selectPlanItems(view: DailyPlan, include: (item: WorkItem) => boolean): DailyPlan {
  const selectGroups = (groups: DailyPlan['byOwner']) => groups
    .map((group) => ({ ...group, items: group.items.filter(include) }))
    .filter((group) => group.items.length > 0);
  const items = view.items.filter(include);
  return { ...view, items, total: items.length, overdueCount: items.filter((item) => item.overdueDays !== null).length,
    byOwner: selectGroups(view.byOwner), bySupplier: selectGroups(view.bySupplier), byFactory: selectGroups(view.byFactory) };
}
