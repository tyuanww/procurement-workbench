import { EntityIdSchema, ProcurementStoreSchema } from '@sw/contracts';
import type { ReactNode } from 'react';
import { Link, useInRouterContext, useLocation } from 'react-router';
import { currentProgressPath, planningLabels, planningScope, planningSectionOf, schedulePath, scheduleWorkspaceBack } from '../../../features/progress/index.js';
import { detailReturnState } from '../../../shared/hooks/detail-return-focus.js';
import { businessToday, deliveryBackAddress, followUpAddress, useFollowUpSearch } from '../../../features/follow-up/index.js';
import { IMPORT_RETURN_PARAM, importFollowUpScope } from '../../../features/imports/index.js';
import { legacyPersonalPath, todayArrivalsPath } from '../../../features/today/index.js';
import { HOME_RISK_RETURN_PARAM, homeRiskBackAddress, homeRiskLineFocus } from '../../director-home/home-location.js';
import { importFollowUpReturn, readImportBatchOriginState } from '../../imports/import-source.js';

type LineDetailLinkProps = { readonly href: string; readonly search: string; readonly children: ReactNode };

export function LineDetailLink(props: LineDetailLinkProps) {
  const search = new URLSearchParams(props.search);
  const scope = importFollowUpScope(search);
  const batch = EntityIdSchema.safeParse(search.get('importBatchId')).data;
  const href = batch === undefined ? props.href : importDetailAddress({ href: props.href, search, batch, back: scope?.to });
  return useInRouterContext() ? <RoutedLineDetailLink {...props} href={href} isScoped={scope !== null} /> : <a href={href}>{props.children}</a>;
}

function importDetailAddress({ href, batch, back, search }: {
  readonly href: string; readonly batch: string; readonly back: string | undefined; readonly search: URLSearchParams;
}): string {
  const detail = new URL(href, 'https://workbench.invalid');
  detail.searchParams.set('importBatchId', batch);
  if (back !== undefined) detail.searchParams.set(IMPORT_RETURN_PARAM, back);
  copyImportStore(search, detail.searchParams);
  return followUpAddress(detail.pathname, detail.searchParams);
}

function copyImportStore(from: URLSearchParams, to: URLSearchParams) {
  const store = ProcurementStoreSchema.safeParse(from.get('store')).data;
  if (store !== undefined) to.set('store', store);
}

function RoutedLineDetailLink({ href, search, children, isScoped }: LineDetailLinkProps & { readonly isScoped: boolean }) {
  const { state } = useLocation();
  const origin = isScoped ? readImportBatchOriginState(state) : undefined;
  return <Link to={href} state={{ lineDeskSearch: search, ...origin }}>{children}</Link>;
}

type PlanningReturnState = NonNullable<ReturnType<typeof detailReturnState>> & { readonly scheduleTaskOrigin?: unknown };
type LineDeskReturnState = { readonly lineDeskFocus: string; readonly importBatchOrigin?: unknown };
export type DetailBack = { readonly to: string; readonly label: string; readonly state?: LineDeskReturnState
  | { readonly todayPendingId: string } | { readonly todayArrivalId: string } | PlanningReturnState };

type BackSource = {
  readonly progress: string | null; readonly delivery?: string | null; readonly home?: string | null; readonly schedule?: string | null;
  readonly deliveryEntry?: string | null;
  readonly state: unknown; readonly lineId: string; readonly todayBatch?: string | null; readonly focusBatch?: string | null;
};

export function readLineDetailBack({ lineId, params, state, canReadImports }: {
  readonly lineId: string; readonly params: URLSearchParams; readonly state: unknown; readonly canReadImports: boolean;
}) {
  const focusBatch = params.get('focusBatch');
  const back = lineDetailBack({ lineId, state, focusBatch, todayBatch: params.get('backToToday') === 'arrivals' ? focusBatch : null,
    progress: params.get('backToProgress'), delivery: params.get('backToDelivery'), deliveryEntry: params.get('deliveryEntry'), home: params.get(HOME_RISK_RETURN_PARAM),
    schedule: params.get('backToSchedule') });
  return back ?? (canReadImports ? importFollowUpReturn({ params, state }) : null) ?? importOrdersBack(params);
}

export function lineDetailBack(input: BackSource): DetailBack | null {
  const home = homeBack(input);
  if (home !== null) return home;
  if (typeof input.delivery === 'string') {
    const to = deliveryBackAddress(input.delivery);
    const state = detailReturnState(input.state, input.deliveryEntry ? { detailPath: to, sourceLink: input.deliveryEntry } : to);
    return { to, label: '返回按店铺交付', ...(state === undefined ? {} : { state }) };
  }
  if (input.progress !== null) return legacyProgressBack(input.progress, input.state);
  const today = todayBack(input.state, input.todayBatch);
  if (today !== null) return today;
  if (input.todayBatch) return { to: `${todayArrivalsPath}&focusBatch=${encodeURIComponent(input.todayBatch)}`, label: '返回在途待收' };
  const to = lineDeskAddress(input.state);
  if (to !== null) return { to, label: '返回跟进中心', state: { lineDeskFocus: input.lineId, ...readImportBatchOriginState(input.state) } };
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

function homeBack(input: BackSource): DetailBack | null {
  const to = homeRiskBackAddress(input.home ?? null);
  if (to === null) return null;
  const sourceLink = homeRiskLineFocus(input.lineId, input.focusBatch ?? null);
  const state = detailReturnState(input.state, { detailPath: to, sourceLink });
  return { to, label: '返回首页', ...(state === undefined ? {} : { state }) };
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
  const params = lineDeskParams(state);
  return params === null ? null : followUpAddress('/lines', params);
}

function lineDeskParams(state: unknown): URLSearchParams | null {
  if (typeof state !== 'object' || state === null || !('lineDeskSearch' in state) || typeof state.lineDeskSearch !== 'string') return null;
  return new URLSearchParams(state.lineDeskSearch);
}

export function arrivalEvidenceLink({ arrivalId, params, state }: {
  readonly arrivalId: string; readonly params: URLSearchParams; readonly state: unknown;
}) {
  const scoped = arrivalDeskScope(params, state);
  const search = scoped ?? new URLSearchParams();
  search.set('arrival', arrivalId);
  return { to: followUpAddress('/lines', search), state: scoped === null ? undefined : readImportBatchOriginState(state) };
}

function importOrdersBack(params: URLSearchParams): DetailBack | null {
  const search = arrivalDeskScope(params, undefined);
  if (search === null) return null;
  search.delete(IMPORT_RETURN_PARAM);
  return { to: followUpAddress('/lines', search), label: '返回本批订单' };
}

function arrivalDeskScope(params: URLSearchParams, state: unknown): URLSearchParams | null {
  const desk = lineDeskParams(state);
  if (desk !== null && EntityIdSchema.safeParse(desk.get('importBatchId')).success) return desk;
  const id = EntityIdSchema.safeParse(params.get('importBatchId'));
  if (!id.success) return null;
  const search = new URLSearchParams({ lane: 'all', importBatchId: id.data });
  const scope = importFollowUpScope(params);
  if (scope !== null) search.set(IMPORT_RETURN_PARAM, scope.to);
  copyImportStore(params, search);
  return search;
}

export function useLineDetailSearchParams() {
  const [params, setParams] = useFollowUpSearch();
  const { state } = useLocation();
  return { params, setParams: (next: URLSearchParams) => setParams(next, { state }) };
}
