import { TODO_REASONS, normalizeUnit, type TodoReason } from '@sw/domain';
import { LocalDateSchema, TodayInboxSchema, TodayWorkFilterSchema, type TodayInbox, type TodaySort, type TodayWorkFilter } from '@sw/contracts';
import { readReasons, taskIdOf, withGroup, type GroupMode } from '../../features/today/index.js';

export const ACTION_PAGE_SIZE = 50;

// The personal inbox adds shipped_not_received only for due or overdue receipts.
export const PRIORITY_BATCH_REASONS = ['overdue', 'due_today', 'shipped_not_received'] as const satisfies readonly TodoReason[];

export function isPriorityBatchSelection(reasons: readonly string[]): boolean {
  return reasons.length === PRIORITY_BATCH_REASONS.length && PRIORITY_BATCH_REASONS.every((reason) => reasons.includes(reason));
}

export type WorkspaceView = 'list' | 'board' | 'calendar';
export type WorkspaceInbox = TodayInbox;
export const CALENDAR_RETURN = 'calendarReturn';

export type ActionQuery = {
  readonly page: number;
  readonly focusId: string | null;
  readonly reasons: readonly TodoReason[];
  readonly sort: TodaySort;
  readonly work: TodayWorkFilter | undefined;
  readonly inbox: WorkspaceInbox | undefined;
  readonly calendar: string | undefined;
};

export type WorkspaceFilterSelection = {
  readonly reasons: readonly string[];
  readonly work: TodayWorkFilter | undefined;
  readonly sort: TodaySort;
  readonly group: GroupMode | undefined;
};

export type ChaseScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'filtered' }
  | { readonly kind: 'factory'; readonly id: string }
  | { readonly kind: 'batch'; readonly id: string };

export function actionQuery(search: string): ActionQuery {
  const params = new URLSearchParams(search);
  const reasons = readReasons(search).filter((reason): reason is TodoReason => TODO_REASONS.some((code) => code === reason));
  const requested = params.get('inbox');
  const inbox = TodayInboxSchema.safeParse(requested).data ?? (reasons.includes('follow_up_scheduled') ? 'scheduled' : 'today');
  return {
    page: readPage(params),
    focusId: params.get('view') === 'arrivals' ? null : readFocus(params),
    reasons,
    sort: readSort(params),
    work: readWork({ params, reasons }),
    inbox: params.get('view') === 'arrivals' ? undefined : inbox,
    calendar: params.get('view') === 'calendar' ? LocalDateSchema.safeParse(params.get('date')).data ?? 'today' : undefined,
  };
}

function readPage(params: URLSearchParams): number {
  const page = Number(params.get('page'));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function readFocus(params: URLSearchParams): string | null {
  const focus = params.get('drawer') ?? params.get('focusId');
  return focus === '' || taskIdOf(focus) !== null ? null : focus;
}

function readSort(params: URLSearchParams): TodaySort {
  const unit = normalizeUnit(params.get('unit'));
  return params.get('sort') === 'bulk' && unit !== null ? { kind: 'bulk', unit } : { kind: 'urgency' };
}

function readWork({ params, reasons }: { readonly params: URLSearchParams; readonly reasons: readonly TodoReason[] }): TodayWorkFilter | undefined {
  const work = TodayWorkFilterSchema.safeParse(params.get('work')).data;
  if (work !== undefined) return work;
  return !params.has('inbox') && reasons.length === 1 && reasons[0] === 'unshipped' ? 'all_unshipped' : undefined;
}

function actionFilters(query: ActionQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.work !== undefined) params.set('work', query.work);
  if (query.reasons.length > 0) params.set('reasons', query.reasons.join(','));
  if (query.sort.kind === 'bulk') {
    params.set('sort', 'bulk');
    params.set('unit', query.sort.unit);
  }
  return params;
}

export function actionPageSearch(query: ActionQuery): string {
  const params = actionFilters(query);
  params.set('scope', 'mine');
  params.set('includePending', 'true');
  if (query.inbox !== undefined) params.set('inbox', query.inbox);
  if (query.calendar !== undefined) {
    params.set('calendar', query.calendar);
    if (query.inbox === 'today') params.set('calendarFollowUps', 'true');
  }
  params.set('page', String(query.page));
  params.set('pageSize', String(ACTION_PAGE_SIZE));
  return params.toString();
}

export function actionChaseSearch(query: ActionQuery, scope: ChaseScope): string {
  const params = scope.kind === 'all' || scope.kind === 'batch' ? new URLSearchParams() : actionFilters(query);
  if (scope.kind === 'batch' && query.work === 'all_unshipped') params.set('work', query.work);
  if (query.inbox !== undefined) params.set('inbox', query.inbox);
  if (query.calendar !== undefined && scope.kind !== 'all') params.set('calendar', query.calendar);
  if (scope.kind === 'batch') params.set('itemId', scope.id);
  if (scope.kind === 'factory') params.set('factoryId', scope.id);
  return params.toString();
}

export function actionPageParams(search: string, page: number): URLSearchParams {
  const params = new URLSearchParams(search);
  if (page === 1) params.delete('page');
  else params.set('page', String(page));
  return params;
}

function actionSortParams(search: string, sort: TodaySort): URLSearchParams {
  const params = newSelection(search);
  params.delete('listPage');
  params.delete('listFocusId');
  if (sort.kind === 'bulk') {
    params.set('sort', 'bulk');
    params.set('unit', sort.unit);
    if (params.get('view') === 'board' || params.get('view') === 'actions' || params.get('group') === 'kanban') params.set('view', 'list');
  } else {
    params.delete('sort');
    params.delete('unit');
  }
  return params;
}

export function workspaceFilterParams(search: string, selection: WorkspaceFilterSelection): URLSearchParams {
  const current = actionQuery(search);
  const reasons = TODO_REASONS.filter((reason) => selection.reasons.includes(reason));
  const next = { ...current, reasons, work: selection.work, sort: selection.sort };
  const hasFilterChange = actionFilters({ ...current, reasons: [...new Set(current.reasons)].sort() }).toString()
    !== actionFilters({ ...next, reasons: [...reasons].sort() }).toString();
  const params = hasFilterChange ? actionSortParams(search, next.sort) : new URLSearchParams(search);
  if (hasFilterChange) {
    const filters = actionFilters(next);
    for (const key of ['reasons', 'work']) {
      const value = filters.get(key);
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    params.set('inbox', current.inbox ?? 'today');
  }
  if (selection.group === undefined) return params;
  return new URLSearchParams(withGroup({ search: params.toString(), group: selection.group }));
}

export function actionWorkParams(search: string, work?: TodayWorkFilter): URLSearchParams {
  const params = actionSortParams(search, { kind: 'urgency' });
  params.delete('reasons');
  if (work === undefined) params.delete('work');
  else params.set('work', work);
  return params;
}

export function actionFactoryParams(search: string, id: string): URLSearchParams {
  const params = new URLSearchParams(search);
  params.set('chaseFactory', id);
  return params;
}

function newSelection(search: string): URLSearchParams {
  const params = actionPageParams(search, 1);
  params.delete('focusId');
  return params;
}

export function workspaceInboxParams(search: string, inbox: WorkspaceInbox): URLSearchParams {
  const params = actionWorkParams(search);
  if (inbox === 'today') params.delete('inbox');
  else params.set('inbox', inbox);
  params.delete('date');
  params.delete('chaseFactory');
  params.delete(CALENDAR_RETURN);
  return params;
}

export function workspaceViewParams(search: string, view: WorkspaceView): URLSearchParams {
  const params = new URLSearchParams(search);
  const isCalendar = params.get('view') === 'calendar';
  // 日历按选定工作日分页，清单与看板共享同一个范围和位置。
  if (!isCalendar && view === 'calendar') {
    moveParam(params, { from: 'page', to: 'listPage' });
    moveParam(params, { from: 'focusId', to: 'listFocusId' });
  } else if (isCalendar && view !== 'calendar') {
    restoreListPosition(params);
  }
  params.set('view', view);
  if (params.get('group') === 'kanban') params.delete('group');
  return params;
}

function restoreListPosition(params: URLSearchParams): void {
  moveParam(params, { from: 'listPage', to: 'page' });
  moveParam(params, { from: 'listFocusId', to: 'focusId' });
}

function moveParam(params: URLSearchParams, { from, to }: { readonly from: string; readonly to: string }): void {
  const value = params.get(from);
  params.delete(from);
  if (value === null) params.delete(to);
  else params.set(to, value);
}

function workspaceDayParams(search: string, date: string | undefined): URLSearchParams {
  const params = newSelection(search);
  if (date === undefined) params.delete('date');
  else params.set('date', date);
  return params;
}

export function workspaceCalendarParams({ search, query, date, asOf }: {
  readonly search: string;
  readonly query: ActionQuery;
  readonly date: string;
  readonly asOf: string | undefined;
}): URLSearchParams {
  const current = new URLSearchParams(search);
  const origin = current.get(CALENDAR_RETURN);
  const isFuture = asOf !== undefined && date > asOf;
  const todayDate = date === asOf ? undefined : date;
  if (isFuture && query.inbox === 'today') return scheduledDayParams({ current, query, date });
  if (!isFuture && query.inbox === 'scheduled' && origin !== null) return todayDayParams({ current, origin, date: todayDate });
  if (date === selectedCalendarDay(query.calendar, asOf)) return current;
  return workspaceDayParams(search, query.inbox === 'today' ? todayDate : date);
}

export function selectedCalendarDay(calendar: string | undefined, asOf: string | undefined): string | undefined {
  return calendar === 'today' ? asOf : calendar;
}

const listPositionKeys = ['listPage', 'listFocusId'] as const;
const savedCalendarKeys = ['reasons', 'work', 'sort', 'unit', ...listPositionKeys] as const;

function scheduledDayParams({ current, query, date }: { readonly current: URLSearchParams; readonly query: ActionQuery; readonly date: string }) {
  const origin = actionFilters(query);
  for (const key of listPositionKeys) {
    const value = current.get(key);
    if (value !== null) origin.set(key, value);
  }
  const params = workspaceInboxParams(current.toString(), 'scheduled');
  params.set(CALENDAR_RETURN, origin.toString());
  params.set('date', date);
  return params;
}

function todayDayParams({ current, origin, date }: { readonly current: URLSearchParams; readonly origin: string; readonly date: string | undefined }) {
  const params = workspaceInboxParams(current.toString(), 'today');
  const saved = new URLSearchParams(origin);
  params.set('inbox', 'today');
  for (const key of savedCalendarKeys) {
    const value = saved.get(key);
    if (value !== null) params.set(key, value);
  }
  if (date !== undefined) params.set('date', date);
  if (params.get('view') !== 'calendar') restoreListPosition(params);
  return params;
}

export function workspaceFocusParams(input: {
  readonly search: string;
  readonly query: ActionQuery;
  readonly destination: WorkspaceInbox | undefined;
  readonly date: string | undefined;
  readonly work?: TodayWorkFilter | undefined;
  readonly id: string;
}): URLSearchParams {
  const { search, query, destination, date, work, id } = input;
  const params = destination !== undefined && destination !== query.inbox ? workspaceInboxParams(search, destination)
    : work !== undefined && work !== query.work ? actionWorkParams(search, work) : newSelection(search);
  if (work !== undefined) params.set('work', work);
  params.set('focusId', id);
  if (query.calendar !== undefined && date !== undefined) params.set('date', date);
  return params;
}
