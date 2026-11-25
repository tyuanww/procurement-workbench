import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';

export type TodayOrderRef = { readonly lineId: string; readonly batchId?: string };

export function TodayOrderLink({ order, isPending, arrivalFocusId, focusRef, ariaLabel, children }: {
  readonly order: TodayOrderRef;
  readonly isPending?: boolean;
  readonly arrivalFocusId?: string;
  readonly ariaLabel?: string | undefined;
  readonly focusRef?: React.Ref<HTMLAnchorElement>;
  readonly children: ReactNode;
}) {
  const location = useLocation();
  const to = '/lines/' + encodeURIComponent(order.lineId)
    + (order.batchId === undefined ? '' : '?' + new URLSearchParams({ focusBatch: order.batchId }));
  const state = location.pathname === '/today/personal' ? { personalTodaySearch: location.search }
    : location.pathname === '/today' ? { todaySearch: location.search, ...(isPending === true ? { todayPendingId: order.lineId } : {}), todayArrivalId: arrivalFocusId } : undefined;
  return <Link ref={focusRef} aria-label={ariaLabel} to={to} state={state}>{children}</Link>;
}
