import type { ReactNode } from 'react';
import { Link, useInRouterContext, useLocation, useSearchParams } from 'react-router';
import { businessToday, deliveryBackAddress } from '../../../features/follow-up/index.js';
import { legacyPersonalPath, todayArrivalsPath } from '../../../features/today/index.js';
import { detailReturnState } from '../../../shared/hooks/detail-return-focus.js';

export function LineDetailLink(props: { readonly href: string; readonly search: string; readonly children: ReactNode }) {
  const isRouted = useInRouterContext();
  if (!isRouted) return <a href={props.href}>{props.children}</a>;
  return <Link to={props.href} state={{ lineDeskSearch: props.search }}>{props.children}</Link>;
}

export type DetailBack = { readonly to: string; readonly label: string; readonly state?: { readonly lineDeskFocus: string } | { readonly todayPendingId: string } | { readonly todayArrivalId: string } | NonNullable<ReturnType<typeof detailReturnState>> };

export function lineDetailBack(input: { readonly progress: string | null; readonly delivery?: string | null; readonly state: unknown; readonly lineId: string; readonly todayBatch?: string | null }): DetailBack | null {
  if (typeof input.delivery === 'string') {
    const to = deliveryBackAddress(input.delivery);
    const state = detailReturnState(input.state, to);
    return { to, label: '返回按店铺交付', ...(state === undefined ? {} : { state }) };
  }
  if (input.progress !== null) return { to: `/progress?${new URLSearchParams(input.progress).toString()}`, label: '返回管理店铺' };
  const today = todayBack(input.state, input.todayBatch);
  if (today !== null) return today;
  if (input.todayBatch) return { to: `${todayArrivalsPath}&focusBatch=${encodeURIComponent(input.todayBatch)}`, label: '返回在途待收' };
  const to = lineDeskAddress(input.state);
  return to === null ? null : { to, label: '返回跟进中心', state: { lineDeskFocus: input.lineId } };
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
