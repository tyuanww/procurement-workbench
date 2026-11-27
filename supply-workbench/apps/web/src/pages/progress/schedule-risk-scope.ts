import type { ProcurementStore, ProjectProgress, ProjectProgressGroupView } from '@sw/contracts';
import { applyScheduleFilters, readScheduleQuery, scheduleOptions, scheduleRiskSource, type ScheduleFilters, type ScheduleWindow } from '../../features/progress/index.js';
import { workItemStatusLabel } from '../../features/today/index.js';
import { scopedDevelopment } from './planning-audience.js';
import { useDevelopment, usePlanningOrders, useScheduleLoad } from './planning-load.js';
import { planningTasks } from './planning-rows.js';
import { progressStoreOf, storeLabels } from './store-query.js';

export type ScheduleRiskScope = {
  readonly store: ProcurementStore;
  readonly filters: ScheduleFilters;
  readonly keyword: string;
};

export function riskScopeOf(params: URLSearchParams, { from }: ScheduleWindow): ScheduleRiskScope {
  const source = scheduleRiskSource(params);
  return {
    store: progressStoreOf(source?.get('store') ?? null),
    filters: readScheduleQuery(source?.toString() ?? '', from).filters,
    keyword: source?.get('planSearch')?.trim() ?? '',
  };
}

export function useRiskScopeData({ scope, window }: { readonly scope: ScheduleRiskScope; readonly window: ScheduleWindow }) {
  const { store, keyword } = scope;
  const shouldLoadStore = store !== 'all';
  const shouldLoadOrders = keyword !== '';
  const shouldLoadDevelopment = shouldLoadOrders && store !== 'unassigned';
  const schedule = useScheduleLoad(window, { store: shouldLoadStore ? store : null });
  const orders = usePlanningOrders(store, shouldLoadOrders);
  const development = useDevelopment(shouldLoadDevelopment ? 'all' : null);
  const active = [
    { enabled: shouldLoadStore, resource: schedule }, { enabled: shouldLoadOrders, resource: orders },
    { enabled: shouldLoadDevelopment, resource: development },
  ].filter(({ enabled }) => enabled).map(({ resource }) => resource);
  const error = active.map(({ load }) => load.kind === 'error' ? load.message : load.kind === 'ready' ? load.notice : null)
    .find((message) => message !== null);
  return {
    loading: active.some(({ load }) => load.kind === 'loading' || (load.kind === 'ready' && load.isRefreshing)),
    error: error ?? null,
    retry: () => active.forEach(({ reload }) => reload()),
    storeItems: schedule.load.kind === 'ready' ? schedule.load.data.items : null,
    orders: orders.load.kind === 'ready' ? orders.load.data : [],
    development: scopedDevelopment(development.load.kind === 'ready' ? development.load.data : null, { store, actorId: undefined }),
  };
}

type ProgressTask = NonNullable<ProjectProgress['details']>['tasks'][number];

export function scopeProjectProgress({ project, scope, window, data }: {
  readonly project: ProjectProgress;
  readonly scope: ScheduleRiskScope;
  readonly window: ScheduleWindow;
  readonly data: ReturnType<typeof useRiskScopeData>;
}): ProjectProgress {
  const { details } = project;
  if (!isFilteredRisk(scope) || details === undefined) return project;
  const items = data.storeItems ?? details.tasks.map(({ item }) => item);
  const matched = scope.keyword === '' ? applyScheduleFilters({ items, filters: scope.filters }) : planningTasks({
    items, filters: scope.filters, query: scope.keyword, window, orders: data.orders, development: data.development,
  });
  const selected = new Set(matched.map(({ id }) => id));
  const tasks = details.tasks.filter(({ item }) => selected.has(item.id));
  const taskById = new Map(tasks.map((task) => [task.item.id, task]));
  const groups = (rows: ProjectProgress['byOwner']) => scopedGroups(rows, taskById);
  return {
    ...project, ...taskCounts(tasks), byOwner: groups(project.byOwner), bySupplier: groups(project.bySupplier),
    byFactory: groups(project.byFactory), details: { ...details, tasks },
  };
}

export function isFilteredRisk({ store, filters, keyword }: ScheduleRiskScope): boolean {
  return store !== 'all' || keyword !== '' || Object.values(filters).some((value) => value !== null);
}

function scopedGroups(groups: readonly ProjectProgressGroupView[], taskById: ReadonlyMap<string, ProgressTask>): ProjectProgressGroupView[] {
  return groups.flatMap((group) => {
    const tasks = (group.itemIds ?? []).flatMap((id) => taskById.get(id) ?? []);
    return tasks.length === 0 ? [] : [{ ...group, ...taskCounts(tasks), itemIds: tasks.map(({ item }) => item.id) }];
  }).sort((left, right) => right.overdue - left.overdue || right.total - left.total || left.key.localeCompare(right.key));
}

function taskCounts(tasks: readonly ProgressTask[]): Pick<ProjectProgress, 'total' | 'done' | 'overdue' | 'blocked' | 'completionRate'> {
  const total = tasks.length;
  const done = tasks.filter(({ item }) => item.status === 'done').length;
  return {
    total, done, completionRate: total === 0 ? null : done / total,
    overdue: tasks.filter(({ overdue }) => overdue).length,
    blocked: tasks.filter(({ item }) => item.status === 'blocked').length,
  };
}

export function riskScopeLabels(scope: ScheduleRiskScope, project: ProjectProgress | null): readonly string[] {
  const { filters, keyword, store } = scope;
  const options = scheduleOptions(project?.details?.tasks.map(({ item }) => item) ?? []);
  return [
    storeLabels[store],
    ...(filters.status === null ? [] : [`状态 ${workItemStatusLabel(filters.status)}`]),
    ...scopeOption(filters.ownerUserId, { label: '负责人', options: options.owners, missing: '未分配' }),
    ...scopeOption(filters.supplierPartyId, { label: '供应商', options: options.suppliers, missing: '未指定供应商' }),
    ...scopeOption(filters.factoryPartyId, { label: '工厂', options: options.factories, missing: '未指定工厂' }),
    ...(keyword === '' ? [] : [`搜索「${keyword}」`]),
  ];
}

function scopeOption(value: string | null, { label, options, missing }: {
  readonly label: string; readonly options: ReturnType<typeof scheduleOptions>['owners']; readonly missing: string;
}): readonly string[] {
  if (value === null) return [];
  const name = value === 'unassigned' ? missing : options.find((option) => option.value === value)?.label ?? '所选范围';
  return [`${label} ${name}`];
}
