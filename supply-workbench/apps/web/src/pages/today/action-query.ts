import { TODO_REASONS, normalizeUnit, type TodoReason } from '@sw/domain';
import type { TodaySort } from '@sw/contracts';
import { readReasons, taskIdOf, withReason } from '../../features/today/index.js';

export const ACTION_PAGE_SIZE = 50;

export type ActionQuery = {
  readonly page: number;
  readonly focusId: string | null;
  readonly reasons: readonly TodoReason[];
  readonly sort: TodaySort;
};

export function actionQuery(search: string): ActionQuery {
  const params = new URLSearchParams(search);
  const page = Number(params.get('page'));
  const unit = normalizeUnit(params.get('unit'));
  const drawer = params.get('drawer');
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    focusId: drawer === '' || taskIdOf(drawer) !== null ? null : drawer,
    reasons: readReasons(search).filter((reason): reason is TodoReason => TODO_REASONS.some((code) => code === reason)),
    sort: params.get('sort') === 'bulk' && unit !== null ? { kind: 'bulk', unit } : { kind: 'urgency' },
  };
}

function actionFilters(query: ActionQuery): URLSearchParams {
  const params = new URLSearchParams();
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
  params.set('page', String(query.page));
  params.set('pageSize', String(ACTION_PAGE_SIZE));
  return params.toString();
}

export function actionChaseSearch(query: ActionQuery, factoryId: string | undefined): string {
  const params = actionFilters(query);
  if (factoryId !== undefined) params.set('factoryId', factoryId);
  return params.toString();
}

export function actionPageParams(search: string, page: number): URLSearchParams {
  const params = new URLSearchParams(search);
  if (page === 1) params.delete('page');
  else params.set('page', String(page));
  return params;
}

export function actionReasonParams(search: string, code: string): URLSearchParams {
  return actionPageParams(withReason({ search, code }), 1);
}

export function actionSortParams(search: string, sort: TodaySort): URLSearchParams {
  const params = actionPageParams(search, 1);
  if (sort.kind === 'bulk') {
    params.set('sort', 'bulk');
    params.set('unit', sort.unit);
  } else {
    params.delete('sort');
    params.delete('unit');
  }
  return params;
}

export function actionFactoryParams(search: string, id: string): URLSearchParams {
  const params = new URLSearchParams(search);
  params.set('chaseFactory', id);
  return params;
}
