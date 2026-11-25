import type { ReactNode } from 'react';
import { Link, useInRouterContext, useLocation, useSearchParams } from 'react-router';
import { todayArrivalsPath } from '../../../features/today/index.js';

export function LineDetailLink(props: { readonly href: string; readonly search: string; readonly children: ReactNode }) {
  const isRouted = useInRouterContext();
  if (!isRouted) return <a href={props.href}>{props.children}</a>;
  return <Link to={props.href} state={{ lineDeskSearch: props.search }}>{props.children}</Link>;
}

export type DetailBack = { readonly to: string; readonly label: string; readonly state?: { readonly lineDeskFocus: string } };

export function lineDetailBack(input: { readonly progress: string | null; readonly state: unknown; readonly lineId: string; readonly todayBatch?: string | null }): DetailBack | null {
  if (input.progress !== null) return { to: `/progress?${new URLSearchParams(input.progress).toString()}`, label: '返回管理店铺' };
  if (input.todayBatch) return { to: `${todayArrivalsPath}&focusBatch=${encodeURIComponent(input.todayBatch)}`, label: '返回在途待收' };
  const to = lineDeskAddress(input.state);
  return to === null ? null : { to, label: '返回跟进中心', state: { lineDeskFocus: input.lineId } };
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
