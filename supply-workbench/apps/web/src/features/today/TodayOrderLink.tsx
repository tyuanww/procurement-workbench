import type { ReactNode } from 'react';
import type { TodayResponse } from '@sw/contracts';
import { Button } from 'antd';
import { Link, useHref, useLinkClickHandler, useLocation } from 'react-router';
import { useDetailFocusLink, useDetailReturnFocus } from '../../shared/hooks/detail-return-focus.js';

export type TodayOrderRef = { readonly lineId: string; readonly batchId?: string };
export type ReceiptWork = TodayResponse['arrivalMemos'][number];

export function TodayReceiptButton({ memo, onOpen, focusRef }: {
  readonly memo: ReceiptWork;
  readonly onOpen: () => void;
  readonly focusRef: React.Ref<HTMLButtonElement>;
}) {
  const label = [memo.line.poRaw, memo.line.nameRaw, memo.batchSeq === null ? null : '第 ' + memo.batchSeq + ' 批'].filter(Boolean).join(' · ');
  return <Button ref={focusRef} className="today-action-primary" color="default" variant="outlined" data-today-receipt
    onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onOpen(); }}
    aria-label={label === '' ? undefined : `核对收货 ${label}`}>核对收货</Button>;
}

export const TODAY_BATCH_RETURN_PARAM = 'backToToday';
export const todayBatchRecordFocus = (batchId: string) => `today-batch-record:${batchId}`;

export function TodayBatchRecordLink({ lineId, batchId, isShown }: { readonly lineId: string; readonly batchId: string; readonly isShown: boolean }) {
  const { search } = useLocation();
  const params = new URLSearchParams({ focusBatch: batchId, [TODAY_BATCH_RETURN_PARAM]: search });
  const to = `/lines/${encodeURIComponent(lineId)}?${params}`;
  const focus = useDetailFocusLink('/today' + search, todayBatchRecordFocus(batchId));
  useDetailReturnFocus(isShown, { allowContainerFocus: true });
  if (new URLSearchParams(search).get('drawer') !== 'batch:' + batchId) return null;
  return <Link to={to} {...focus}>核对本批记录</Link>;
}

export function TodayOrderLink({ order, isPending, focusRef, ariaLabel, primary, focusOwner, returnRowId, id, children }: {
  readonly order: TodayOrderRef;
  readonly isPending?: boolean;
  readonly ariaLabel?: string | undefined;
  readonly focusRef?: React.Ref<HTMLAnchorElement> | undefined;
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
  const state = location.pathname === '/today' ? {
    todaySearch: workspaceReturn(location.search, returnRowId),
    ...(isPending === true ? { todayPendingId: order.lineId } : {}),
  } : undefined;
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
