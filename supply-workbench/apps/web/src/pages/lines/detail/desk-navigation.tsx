import type { ReactNode } from 'react';
import { Link, useInRouterContext, useLocation, useSearchParams } from 'react-router';
import { currentProgressPath, planningLabels, planningScope, planningSectionOf, schedulePath, scheduleWorkspaceBack } from '../../../features/progress/index.js';
import { detailReturnState } from '../../../shared/hooks/detail-return-focus.js';
import { businessToday, deliveryBackAddress } from '../../../features/follow-up/index.js';
import { legacyPersonalPath, todayArrivalsPath } from '../../../features/today/index.js';

export function LineDetailLink(props: { readonly href: string; readonly search: string; readonly children: ReactNode }) {
  const isRouted = useInRouterContext();
  if (!isRouted) return <a href={props.href}>{props.children}</a>;
  return <Link to={props.href} state={{ lineDeskSearch: props.search }}>{props.children}</Link>;
}

type PlanningReturnState = NonNullable<ReturnType<typeof detailReturnState>> & { readonly scheduleTaskOrigin?: unknown };
export type DetailBack = { readonly to: string; readonly label: string; readonly state?: { readonly lineDeskFocus: string }
  | { readonly todayPendingId: string } | { readonly todayArrivalId: string } | PlanningReturnState };

export function lineDetailBack(input: { readonly progress: string | null; readonly delivery?: string | null; readonly schedule?: string | null; readonly state: unknown; readonly lineId: string; readonly todayBatch?: string | null }): DetailBack | null {
  if (typeof input.delivery === 'string') {
    const to = deliveryBackAddress(input.delivery);
    const state = detailReturnState(input.state, to);
    return { to, label: '返回按店铺交付', ...(state === undefined ? {} : { state }) };
  }
  if (input.progress !== null) return legacyProgressBack(input.progress, input.state);
  const today = todayBack(input.state, input.todayBatch);
  if (today !== null) return today;
  if (input.todayBatch) return { to: `${todayArrivalsPath}&focusBatch=${encodeURIComponent(input.todayBatch)}`, label: '返回在途待收' };
  const to = lineDeskAddress(input.state);
  if (to !== null) return { to, label: '返回跟进中心', state: { lineDeskFocus: input.lineId } };
  return typeof input.schedule === 'string' ? scheduleBack(new URLSearchParams(input.schedule), input.state) : null;
}

function legacyProgressBack(search: string, state: unknown): DetailBack {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  if (view === 'schedule' || (view !== 'current' && params.has('scheduleLine'))) return scheduleBack(params, state);
  return { to: params.size === 0 ? currentProgressPath : `${currentProgressPath}?${params}`, label: '返回当前进度' };
}

function scheduleBack(params: URLSearchParams, state: unknown): DetailBack {
  const address = scheduleWorkspaceBack(params);
  const mode = params.get('planEntry');
  const isDevelopment = mode === 'development' || (mode === 'alias' && params.get('view') === 'development');
  const label = planningLabels[planningSectionOf(planningScope(params, isDevelopment ? 'development' : 'orders'))];
  const origin = detailReturnState(state, address);
  const scheduleTaskOrigin = typeof state === 'object' && state !== null && 'scheduleTaskOrigin' in state ? state.scheduleTaskOrigin : undefined;
  return {
    to: address, label: `返回${label}`,
    ...(origin === undefined ? {} : { state: { ...origin, ...(scheduleTaskOrigin === undefined ? {} : { scheduleTaskOrigin }) } }),
  };
}

export function orderScheduleAddress({ params, lineId }: { readonly params: URLSearchParams; readonly lineId: string }): string {
  const schedule = new URLSearchParams(params.get('backToSchedule') ?? params.get('backToProgress') ?? '');
  const store = params.get('store');
  if (store !== null) schedule.set('store', store);
  for (const key of ['view', 'lens', 'scheduleReturn', 'planEntry', 'planScope', 'planSelected', 'drawer', 'taskMode', 'taskParent', 'riskReturn', 'scheduleBatch',
    'scheduleBatchEntry', 'procurementTask', 'developmentProject', 'developmentNode', 'developmentNodeProject']) schedule.delete(key);
  schedule.set('scheduleLine', lineId);
  return `${schedulePath}?${schedule}`;
}

function todayBack(state: unknown, batchId: string | null | undefined): DetailBack | null {
  if (typeof state !== 'object' || state === null) return null;
  if ('personalTodaySearch' in state && typeof state.personalTodaySearch === 'string') {
    return { to: legacyPersonalPath(state.personalTodaySearch, businessToday()), label: '返回个人工作台' };
  }
  if (!('todaySearch' in state) || typeof state.todaySearch !== 'string') return null;
  const query = new URLSearchParams(state.todaySearch);
  if (query.get('view') === 'arrivals' && batchId) {
    query.set('focusBatch', batchId);
    return { to: '/today?' + query, label: '返回在途待收' };
  }
  return actionBack(query, state);
}

function actionBack(query: URLSearchParams, state: object): DetailBack {
  const pending = 'todayPendingId' in state && typeof state.todayPendingId === 'string' ? state.todayPendingId : null;
  const to = query.size === 0 ? '/today' : '/today?' + query;
  if (pending !== null) return { to, label: '返回待建批次', state: { todayPendingId: pending } };
  const label = ['schedule', 'owner', 'supplier'].includes(query.get('group') ?? '') ? '返回今日排期' : '返回个人工作台';
  const arrival = 'todayArrivalId' in state && typeof state.todayArrivalId === 'string' ? state.todayArrivalId : null;
  return arrival === null ? { to, label } : { to, label, state: { todayArrivalId: arrival } };
}

export function readReturningLine(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('lineDeskFocus' in state) || typeof state.lineDeskFocus !== 'string') return null;
  return state.lineDeskFocus;
}

function lineDeskAddress(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('lineDeskSearch' in state) || typeof state.lineDeskSearch !== 'string') return null;
  const search = new URLSearchParams(state.lineDeskSearch).toString();
  return search === '' ? '/lines' : `/lines?${search}`;
}

export function useLineDetailSearchParams() {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  return { params, setParams: (next: URLSearchParams) => setParams(next, { state }) };
}
