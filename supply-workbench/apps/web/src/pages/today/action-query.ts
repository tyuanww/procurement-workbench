import { TODO_REASONS, normalizeUnit, type TodoReason } from '@sw/domain';
import { LocalDateSchema, TodayInboxSchema, TodayWorkFilterSchema, type TodayInbox, type TodaySort, type TodayWorkFilter } from '@sw/contracts';
import { readReasons, taskIdOf, withReason } from '../../features/today/index.js';

export const ACTION_PAGE_SIZE = 50;

export type WorkspaceView = 'list' | 'board' | 'calendar';
export type WorkspaceInbox = TodayInbox;

export type ActionQuery = {
  readonly page: number;
  readonly focusId: string | null;
  readonly reasons: readonly TodoReason[];
  readonly sort: TodaySort;
  readonly work: TodayWorkFilter | undefined;
  readonly inbox: WorkspaceInbox | undefined;
  readonly calendar: string | undefined;
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
    focusId: readFocus(params),
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

export function actionReasonParams(search: string, code: string): URLSearchParams {
  const params = newSelection(withReason({ search, code }));
  if (!params.has('inbox')) params.set('inbox', actionQuery(search).inbox ?? 'today');
  return params;
}

export function actionSortParams(search: string, sort: TodaySort): URLSearchParams {
  const params = newSelection(search);
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
  return params;
}

export function workspaceViewParams(search: string, view: WorkspaceView): URLSearchParams {
  const current = new URLSearchParams(search);
  const shouldReset = (current.get('view') === 'calendar') !== (view === 'calendar')
    || (view === 'board' && current.get('sort') === 'bulk');
  const params = shouldReset ? newSelection(search) : current;
  params.set('view', view);
  if (params.get('group') === 'kanban') params.delete('group');
  if (view === 'board' && params.get('sort') === 'bulk') {
    params.delete('sort');
    params.delete('unit');
  }
  return params;
}

export function workspaceDayParams(search: string, date: string): URLSearchParams {
  const params = newSelection(search);
  params.set('date', date);
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
