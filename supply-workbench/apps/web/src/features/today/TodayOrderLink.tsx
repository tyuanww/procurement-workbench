import type { ReactNode } from 'react';
import { Button } from 'antd';
import { Link, useHref, useLinkClickHandler, useLocation } from 'react-router';

export type TodayOrderRef = { readonly lineId: string; readonly batchId?: string };

export function TodayOrderLink({ order, isPending, arrivalFocusId, focusRef, ariaLabel, primary, focusOwner, returnRowId, id, children }: {
  readonly order: TodayOrderRef;
  readonly isPending?: boolean;
  readonly arrivalFocusId?: string;
  readonly ariaLabel?: string | undefined;
  readonly focusRef?: React.Ref<HTMLAnchorElement>;
  readonly primary?: boolean;
  readonly focusOwner?: boolean;
  readonly returnRowId?: string;
  readonly id?: string;
  readonly children: ReactNode;
}) {
  const location = useLocation();
  const params = new URLSearchParams();
  if (order.batchId !== undefined) params.set('focusBatch', order.batchId);
  if (focusOwner === true) params.set('focus', 'buyer');
  const to = '/lines/' + encodeURIComponent(order.lineId) + (params.size === 0 ? '' : '?' + params);
  const state = location.pathname === '/today'
    ? { todaySearch: workspaceReturn(location.search, returnRowId), ...(isPending === true ? { todayPendingId: order.lineId } : {}), todayArrivalId: arrivalFocusId } : undefined;
  const href = useHref(to);
  const open = useLinkClickHandler<HTMLAnchorElement>(to, { state });
  if (primary === true) return <Button id={id} ref={focusRef} className="today-action-primary" color="default" variant="outlined"
    href={href} onClick={open} aria-label={ariaLabel}>{children}</Button>;
  return <Link id={id} ref={focusRef} aria-label={ariaLabel} to={to} state={state}>{children}</Link>;
}

function workspaceReturn(search: string, rowId: string | undefined): string {
  if (rowId === undefined) return search;
  const params = new URLSearchParams(search);
  params.set('focusId', rowId);
  return '?' + params;
}
