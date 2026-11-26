import { Button, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { TodayPaging, TodayResponse } from '@sw/contracts';
import { todayArrivalsPath } from '../../features/today/index.js';
import type { ActionPageControls } from './ActionControls.js';
import { focusSection } from './today-focus.js';
import { PENDING_BATCH_TARGET } from './PendingBatches.js';
import type { WorkspaceInbox } from './action-query.js';
import { PLAN_TASK_TARGET } from './TodayAgenda.js';
import type { MyPlan } from './use-today-plan.js';

export type ArrivalTiming = 'overdue' | 'due_today';

export function arrivalShortcutPath({ timing, returnSearch }: { readonly timing?: ArrivalTiming; readonly returnSearch: string }) {
  const path = new URLSearchParams();
  const action = new URLSearchParams(returnSearch);
  if (action.get('view') === 'arrivals') action.delete('view');
  for (const key of ['timing', 'focusBatch', 'actionReturn', 'drawer', 'draft']) action.delete(key);
  if (timing !== undefined) path.set('timing', timing);
  if (action.size > 0) path.set('actionReturn', action.toString());
  return path.size === 0 ? todayArrivalsPath : todayArrivalsPath + '&' + path;
}

const inboxes: readonly { readonly key: WorkspaceInbox; readonly label: string; readonly unit: string }[] = [
  { key: 'today', label: '今天要办', unit: ' 项' },
  { key: 'scheduled', label: '已约跟进', unit: ' 批' },
  { key: 'unassigned', label: '待分派', unit: ' 项' },
];

type TodayLinksProps = {
  readonly asOf: TodayResponse['asOf'] | undefined;
  readonly page: ActionPageControls | undefined;
  readonly myPlan: MyPlan | undefined;
  readonly onRetryPlan: () => void;
  readonly inbox: WorkspaceInbox;
  readonly onInbox: (inbox: WorkspaceInbox) => void;
};

export function TodayLinks(props: TodayLinksProps) {
  const { page, myPlan, inbox, asOf } = props;
  const planCount = myPlan?.kind === 'ready' ? myPlan.rows.length : undefined;
  const isPlanUnavailable = myPlan?.kind === 'error';
  const counts = workspaceCounts({ paging: page?.paging, planCount, isPlanUnavailable });
  return <div className="today-workspace-intro">
    <div className="today-workspace-heading">
      <ActiveScope inbox={inbox} count={counts[inbox]} hasSharedReviews={hasSharedReviews(page)} />
      {asOf === undefined ? null : <Typography.Text type="secondary" className="today-business-date">
        业务日 <time dateTime={asOf}>{asOf}</time>
      </Typography.Text>}
    </div>
    <ScopeSwitch {...props} counts={counts} canRetry={isPlanUnavailable} />
    {inbox === 'today' && isPlanUnavailable && counts.today !== undefined
      ? <Typography.Text type="secondary">已加载 · 排期未读</Typography.Text> : null}
    <ReviewScopeNote page={page} />
  </div>;
}

function ActiveScope({ inbox, count, hasSharedReviews: hasReviews }: {
  readonly inbox: WorkspaceInbox; readonly count: number | undefined; readonly hasSharedReviews: boolean;
}) {
  const active = inboxes.find(({ key }) => key === inbox);
  if (active === undefined) return null;
  return <Typography.Title level={2}>
    {scopeLabel(active, hasReviews)} <strong>{count ?? '—'}</strong>{count === undefined ? null : <small>{active.unit}</small>}
    {inbox === 'unassigned' ? null : <small className="today-mine-scope">本人范围</small>}
  </Typography.Title>;
}

function ScopeSwitch({ inbox, onInbox, onRetryPlan, page, asOf, counts, canRetry }: Omit<TodayLinksProps, 'myPlan'> & {
  readonly counts: ReturnType<typeof workspaceCounts>;
  readonly canRetry: boolean;
}) {
  const canReturn = inbox === 'today' && isOtherWorkDay(page?.calendar, asOf);
  return <nav className="today-workspace-scopes today-touch" aria-label="工作范围">
    {inboxes.filter(({ key }) => key !== inbox).map((scope) => (
      <Button key={scope.key} onClick={() => onInbox(scope.key)}>{scopeLabel(scope, hasSharedReviews(page))} <strong>{counts[scope.key] ?? '—'}</strong>{counts[scope.key] === undefined ? null : scope.unit}</Button>
    ))}
    {canReturn ? <Button onClick={() => onInbox('today')}>回到业务日</Button> : null}
    {canRetry ? <Button onClick={onRetryPlan}>重试排期</Button> : null}
  </nav>;
}

function scopeLabel(scope: (typeof inboxes)[number], hasReviews: boolean): string {
  return scope.key === 'unassigned' && hasReviews ? '待分派与审核' : scope.label;
}

function hasSharedReviews(page: ActionPageControls | undefined): boolean {
  return (page?.paging.unassignedReviewCount ?? 0) > 0;
}

function isOtherWorkDay(date: string | undefined, businessDate: string | undefined): boolean {
  return date !== undefined && date !== 'today' && date !== businessDate;
}

function workspaceCounts({ paging, planCount, isPlanUnavailable }: {
  readonly paging: TodayPaging | undefined;
  readonly planCount: number | undefined;
  readonly isPlanUnavailable: boolean;
}) {
  const counts = paging?.inboxCounts;
  const pendingCount = paging?.pendingCount;
  const loadedPlanCount = isPlanUnavailable ? 0 : planCount;
  const today = counts === undefined || pendingCount === undefined || loadedPlanCount === undefined
    ? undefined : counts.today + pendingCount + loadedPlanCount;
  return { today, scheduled: counts?.scheduled, unassigned: counts?.unassigned };
}

function ReviewScopeNote({ page }: { readonly page: ActionPageControls | undefined }) {
  if (page?.inbox !== 'unassigned') return null;
  const reviewCount = page.paging.unassignedReviewCount;
  const total = page.paging.inboxCounts?.unassigned;
  if (reviewCount === undefined || total === undefined) {
    return page.paging.reasonCounts.review_pending > 0 ? <Typography.Text type="secondary">含共享主数据待审核</Typography.Text> : null;
  }
  if (reviewCount === 0) return null;
  return <div className="today-review-scope today-touch">
    <Typography.Text type="secondary">待分派 {total - reviewCount} 项</Typography.Text>
    <Link to="/master">共享主数据审核 {reviewCount} 项</Link>
  </div>;
}

export function TodayAgendaShortcuts({ pendingCount, planCount, jump }: {
  readonly pendingCount: number;
  readonly planCount: number | undefined;
  readonly jump: (id: string) => void;
}) {
  return <>
    {!planCount ? null : <JumpLink id={PLAN_TASK_TARGET} jump={jump}>我的到期排期 {planCount} 项</JumpLink>}
    {pendingCount === 0 ? null : <JumpLink id={PENDING_BATCH_TARGET} jump={jump}>待建批次 {pendingCount} 行</JumpLink>}
  </>;
}

export function useAgendaJump({ page, onReset, onShow }: {
  readonly page: ActionPageControls | undefined;
  readonly onReset: () => void;
  readonly onShow: () => void;
}) {
  const [jumpId, setJumpId] = useState<string | null>(null);
  const canJump = page?.isSettled !== false;
  useEffect(() => {
    if (jumpId === null || !canJump || !focusSection(jumpId)) return;
    onShow();
    setJumpId(null);
  }, [jumpId, canJump, onShow]);
  const jump = (id: string) => {
    onShow();
    if (canJump && focusSection(id)) return;
    setJumpId(id);
    if (!canJump || document.getElementById(id) === null) onReset();
  };
  return { jump, jumpId };
}

function JumpLink({ id, children, jump }: { readonly id: string; readonly children: React.ReactNode; readonly jump: (id: string) => void }) {
  return <Button size="small" href={`#${id}`} onClick={(event) => {
    event.preventDefault();
    jump(id);
  }}>{children}</Button>;
}
