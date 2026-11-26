import type { ReactNode } from 'react';
import { Button } from 'antd';
import { Link, useHref, useLinkClickHandler, useLocation } from 'react-router';

export type TodayOrderRef = { readonly lineId: string; readonly batchId?: string };

export function TodayOrderLink({ order, isPending, arrivalFocusId, focusRef, ariaLabel, primary, id, children }: {
  readonly order: TodayOrderRef;
  readonly isPending?: boolean;
  readonly arrivalFocusId?: string;
  readonly ariaLabel?: string | undefined;
  readonly focusRef?: React.Ref<HTMLAnchorElement>;
  readonly primary?: boolean;
  readonly id?: string;
  readonly children: ReactNode;
}) {
  const location = useLocation();
  const to = '/lines/' + encodeURIComponent(order.lineId)
    + (order.batchId === undefined ? '' : '?' + new URLSearchParams({ focusBatch: order.batchId }));
  const state = location.pathname === '/today'
    ? { todaySearch: location.search, ...(isPending === true ? { todayPendingId: order.lineId } : {}), todayArrivalId: arrivalFocusId } : undefined;
  const href = useHref(to);
  const open = useLinkClickHandler<HTMLAnchorElement>(to, { state });
  if (primary === true) return <Button id={id} ref={focusRef} type="primary" size="small" href={href} onClick={open} aria-label={ariaLabel}>{children}</Button>;
  return <Link id={id} ref={focusRef} aria-label={ariaLabel} to={to} state={state}>{children}</Link>;
}
