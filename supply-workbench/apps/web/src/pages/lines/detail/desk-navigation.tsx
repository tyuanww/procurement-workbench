import type { ReactNode } from 'react';
import { Link, useInRouterContext, useLocation } from 'react-router';
import { currentProgressPath, planningLabels, planningScope, planningSectionOf, schedulePath, scheduleWorkspaceBack } from '../../../features/progress/index.js';
import { detailReturnState } from '../../../shared/hooks/detail-return-focus.js';
import { businessToday, deliveryBackAddress, followUpAddress, useFollowUpSearch } from '../../../features/follow-up/index.js';
import { legacyPersonalPath, TODAY_BATCH_RETURN_PARAM, todayArrivalsPath, todayBatchRecordFocus } from '../../../features/today/index.js';
import { HOME_RISK_RETURN_PARAM, homeRiskBackAddress, homeRiskLineFocus } from '../../director-home/home-location.js';

export function LineDetailLink(props: { readonly href: string; readonly search: string; readonly children: ReactNode }) {
  const isRouted = useInRouterContext();
  if (!isRouted) return <a href={props.href}>{props.children}</a>;
  return <Link to={props.href} state={{ lineDeskSearch: props.search }}>{props.children}</Link>;
}

type PlanningReturnState = NonNullable<ReturnType<typeof detailReturnState>> & { readonly scheduleTaskOrigin?: unknown };
export type DetailBack = { readonly to: string; readonly label: string; readonly state?: { readonly lineDeskFocus: string }
  | { readonly todayPendingId: string } | { readonly todayArrivalId: string } | PlanningReturnState };

type BackSource = {
  readonly progress: string | null; readonly delivery?: string | null; readonly home?: string | null; readonly schedule?: string | null;
  readonly deliveryEntry?: string | null;
  readonly state: unknown; readonly lineId: string; readonly todayBatch?: string | null; readonly focusBatch?: string | null; readonly today?: string | null;
};

export function readLineDetailBack({ lineId, params, state }: { readonly lineId: string; readonly params: URLSearchParams; readonly state: unknown }) {
  const focusBatch = params.get('focusBatch');
  const today = params.get(TODAY_BATCH_RETURN_PARAM);
  return lineDetailBack({ lineId, state, focusBatch, today, todayBatch: today === 'arrivals' ? focusBatch : null,
    progress: params.get('backToProgress'), delivery: params.get('backToDelivery'), deliveryEntry: params.get('deliveryEntry'), home: params.get(HOME_RISK_RETURN_PARAM),
    schedule: params.get('backToSchedule') });
}

export function lineDetailBack(input: BackSource): DetailBack | null {
  const home = homeBack(input);
  if (home !== null) return home;
  const delivery = deliveryBack(input);
  if (delivery !== null) return delivery;
  if (input.progress !== null) return legacyProgressBack(input.progress, input.state);
  const batchDrawer = todayBatchDrawerBack(input);
  if (batchDrawer !== null) return batchDrawer;
  const today = todayBack(input.state, input.todayBatch);
  if (today !== null) return today;
  if (input.todayBatch) return { to: `${todayArrivalsPath}&focusBatch=${encodeURIComponent(input.todayBatch)}`, label: '返回在途待收' };
  const to = lineDeskAddress(input.state);
  if (to !== null) return { to, label: '返回跟进中心', state: { lineDeskFocus: input.lineId } };
  return typeof input.schedule === 'string' ? scheduleBack(new URLSearchParams(input.schedule), input.state) : null;
}

function deliveryBack(input: BackSource): DetailBack | null {
  if (typeof input.delivery !== 'string') return null;
  const to = deliveryBackAddress(input.delivery);
  const target = input.deliveryEntry ? { detailPath: to, sourceLink: input.deliveryEntry } : to;
  const state = detailReturnState(input.state, target);
  return { to, label: '返回按店铺交付', ...(state === undefined ? {} : { state }) };
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

function homeBack(input: BackSource): DetailBack | null {
  const to = homeRiskBackAddress(input.home ?? null);
  if (to === null) return null;
  const sourceLink = homeRiskLineFocus(input.lineId, input.focusBatch ?? null);
  const state = detailReturnState(input.state, { detailPath: to, sourceLink });
  return { to, label: '返回首页', ...(state === undefined ? {} : { state }) };
}

function todayBatchDrawerBack({ today, focusBatch, state }: BackSource): DetailBack | null {
  if (typeof today !== 'string' || !today.startsWith('?') || typeof focusBatch !== 'string') return null;
  const query = new URLSearchParams(today);
  if (query.get('drawer') !== 'batch:' + focusBatch) return null;
  const to = '/today' + today;
  const label = query.get('view') === 'arrivals' ? '返回在途待收' : todayActionBackLabel(query);
  const origin = detailReturnState(state, { detailPath: to, sourceLink: todayBatchRecordFocus(focusBatch) });
  return { to, label, ...(origin === undefined ? {} : { state: origin }) };
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
  const label = todayActionBackLabel(query);
  const arrival = 'todayArrivalId' in state && typeof state.todayArrivalId === 'string' ? state.todayArrivalId : null;
  return arrival === null ? { to, label } : { to, label, state: { todayArrivalId: arrival } };
}

function todayActionBackLabel(query: URLSearchParams): string {
  const isSchedule = query.get('view') === 'schedule' || ['schedule', 'owner', 'supplier'].includes(query.get('group') ?? '');
  return isSchedule ? '返回今日排期' : '返回个人工作台';
}

export function readReturningLine(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('lineDeskFocus' in state) || typeof state.lineDeskFocus !== 'string') return null;
  return state.lineDeskFocus;
}

function lineDeskAddress(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('lineDeskSearch' in state) || typeof state.lineDeskSearch !== 'string') return null;
  return followUpAddress('/lines', new URLSearchParams(state.lineDeskSearch));
}

export function useLineDetailSearchParams() {
  const [params, setParams] = useFollowUpSearch();
  const { state } = useLocation();
  return { params, setParams: (next: URLSearchParams) => setParams(next, { state }) };
}
