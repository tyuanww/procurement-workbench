import { Button, Flex, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { TodayPaging, TodayResponse } from '@sw/contracts';
import { todayArrivalsPath } from '../../features/today/index.js';
import { MetricStrip } from '../../shared/ui/analytics.js';
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
  readonly pending: number;
  readonly asOf: TodayResponse['asOf'] | undefined;
  readonly page: ActionPageControls | undefined;
  readonly myPlan: MyPlan | undefined;
  readonly onRetryPlan: () => void;
  readonly inbox: WorkspaceInbox;
  readonly onInbox: (inbox: WorkspaceInbox) => void;
};

export function TodayLinks(props: TodayLinksProps) {
  const { page, pending, myPlan, inbox, onInbox } = props;
  const pendingCount = page?.paging.pendingCount ?? pending;
  const planCount = myPlan?.kind === 'ready' ? myPlan.rows.length : undefined;
  const counts = workspaceCounts({ paging: page?.paging, planCount });
  return <nav className="today-touch" aria-label="我的待办入口">
    <Flex vertical gap="small">
      <MetricStrip compact ariaLabel="工作范围" items={inboxes.map(({ key, label, unit }) => ({
        key, label, value: counts[key] ?? '—', ...(counts[key] === undefined ? {} : { unit }),
        action: { isActive: key === inbox, select: () => { if (key !== inbox) onInbox(key); } },
      }))} />
      <TodayShortcuts {...props} pendingCount={pendingCount} planCount={planCount} />
    </Flex>
  </nav>;
}

function workspaceCounts({ paging, planCount }: { readonly paging: TodayPaging | undefined; readonly planCount: number | undefined }) {
  const counts = paging?.inboxCounts;
  const pendingCount = paging?.pendingCount;
  const today = counts === undefined || pendingCount === undefined || planCount === undefined
    ? undefined : counts.today + pendingCount + planCount;
  return { today, scheduled: counts?.scheduled, unassigned: counts?.unassigned };
}

function TodayShortcuts({ page, asOf, myPlan, onRetryPlan, inbox, onInbox, pendingCount, planCount }: TodayLinksProps & {
  readonly pendingCount: number;
  readonly planCount: number | undefined;
}) {
  const jump = useAgendaJump({ page, onReset: () => onInbox('today') });
  return <Flex gap="small" align="center" wrap>
    {inbox === 'today' ? <TodayOnlyShortcuts pendingCount={pendingCount} planCount={planCount} jump={jump} /> : null}
    <ReviewScopeNote page={page} />
    {myPlan?.kind === 'error' ? <Button size="small" onClick={onRetryPlan}>重试排期</Button> : null}
    {asOf === undefined ? null : <Typography.Text type="secondary" style={{ marginInlineStart: 'auto' }}>
      业务日 <time dateTime={asOf}>{asOf}</time>
    </Typography.Text>}
  </Flex>;
}

function ReviewScopeNote({ page }: { readonly page: ActionPageControls | undefined }) {
  if (page?.inbox !== 'unassigned' || page.paging.reasonCounts.review_pending === 0) return null;
  return <Typography.Text type="secondary">含共享主数据待审核</Typography.Text>;
}

function TodayOnlyShortcuts({ pendingCount, planCount, jump }: {
  readonly pendingCount: number;
  readonly planCount: number | undefined;
  readonly jump: (id: string) => void;
}) {
  return <>
    {!planCount ? null : <JumpLink id={PLAN_TASK_TARGET} jump={jump}>我的到期排期 {planCount} 项</JumpLink>}
    {pendingCount === 0 ? null : <JumpLink id={PENDING_BATCH_TARGET} jump={jump}>待建批次 {pendingCount} 行</JumpLink>}
  </>;
}

function useAgendaJump({ page, onReset }: { readonly page: ActionPageControls | undefined; readonly onReset: () => void }) {
  const [jumpId, setJumpId] = useState<string | null>(null);
  const canJump = page?.isSettled !== false;
  useEffect(() => {
    if (jumpId !== null && canJump && focusSection(jumpId)) setJumpId(null);
  }, [jumpId, canJump]);
  return (id: string) => {
    if (canJump && focusSection(id)) return;
    setJumpId(id);
    onReset();
  };
}

function JumpLink({ id, children, jump }: { readonly id: string; readonly children: React.ReactNode; readonly jump: (id: string) => void }) {
  return <Button size="small" href={`#${id}`} onClick={(event) => {
    event.preventDefault();
    jump(id);
  }}>{children}</Button>;
}
