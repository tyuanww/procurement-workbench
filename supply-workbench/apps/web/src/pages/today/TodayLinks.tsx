import { Button, Card, Flex, Typography } from 'antd';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { TodayResponse, TodayWorkFilter } from '@sw/contracts';
import { todayArrivalsPath } from '../../features/today/index.js';
import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import type { ActionPageControls } from './ActionControls.js';
import { PENDING_BATCH_TARGET } from './PendingBatches.js';
import type { MyPlan } from './use-today-plan.js';

const ARRIVAL_LINKS = [
  { timing: 'overdue', title: '到仓逾期' },
  { timing: 'due_today', title: '今日应到' },
] as const;

export type ArrivalTiming = typeof ARRIVAL_LINKS[number]['timing'];

export function arrivalShortcutPath({ timing, returnSearch }: { readonly timing?: ArrivalTiming; readonly returnSearch: string }) {
  const path = new URLSearchParams();
  const action = new URLSearchParams(returnSearch);
  for (const key of ['view', 'timing', 'focusBatch', 'actionReturn', 'drawer', 'draft']) action.delete(key);
  if (timing !== undefined) path.set('timing', timing);
  if (action.size > 0) path.set('actionReturn', action.toString());
  return path.size === 0 ? todayArrivalsPath : todayArrivalsPath + '&' + path;
}

export function TodayLinks({ pending, arrivals, buyerName, asOf, page, isPendingFiltered, myPlan, onRetryPlan, returnSearch }: {
  readonly pending: number;
  readonly arrivals: TodayResponse['arrivalMemos'];
  readonly buyerName: string;
  readonly asOf: TodayResponse['asOf'] | undefined;
  readonly page: ActionPageControls | undefined;
  readonly isPendingFiltered: boolean;
  readonly myPlan: MyPlan | undefined;
  readonly onRetryPlan: () => void;
  readonly returnSearch: string;
}) {
  const jumpPending = usePendingJump({ isPendingFiltered, page });
  return <Card size="small"><nav className="today-touch" aria-label="我的待办入口">
    <Flex vertical gap="small">
      <Flex align="baseline" gap="small" wrap>
        <Typography.Text strong>我负责的待办{buyerName === '' ? '' : ` · ${buyerName}`}</Typography.Text>
        {asOf === undefined ? null : <Typography.Text type="secondary">业务日 <time dateTime={asOf}>{asOf}</time></Typography.Text>}
      </Flex>
      <Flex gap="small" align="center" wrap>
        {page === undefined ? null : <BatchLinks page={page} />}
        {pending === 0 ? null : <Button size="small" href={`#${PENDING_BATCH_TARGET}`} onClick={(event) => {
          event.preventDefault();
          jumpPending();
        }}>待建批次 {pending} 行</Button>}
        {ARRIVAL_LINKS.map(({ timing, title }) => {
          const count = arrivals.filter((memo) => memo.status === timing).length;
          return count === 0 ? null : <Link key={timing} to={arrivalShortcutPath({ timing, returnSearch })}>{title} {count} 批</Link>;
        })}
        <PlanLink plan={myPlan} onRetry={onRetryPlan} />
        <ProcurementCutoff />
      </Flex>
    </Flex>
  </nav></Card>;
}

function usePendingJump({ isPendingFiltered, page }: { readonly isPendingFiltered: boolean; readonly page: ActionPageControls | undefined }) {
  const canJump = !isPendingFiltered && page?.isSettled !== false;
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current || !canJump) return;
    pending.current = false;
    focusSection(PENDING_BATCH_TARGET);
  }, [canJump]);
  return () => {
    if (canJump && focusSection(PENDING_BATCH_TARGET)) return;
    pending.current = true;
    if (isPendingFiltered) page?.onWork();
  };
}

function BatchLinks({ page }: { readonly page: ActionPageControls }) {
  const scopes: readonly { key: TodayWorkFilter; label: string; count: number | undefined }[] = [
    { key: 'factory_chase', label: '要催货', count: page.paging.chaseCounts?.all },
    { key: 'internal_note', label: '内部等回单', count: page.paging.internalNoteCount },
  ];
  const due = page.paging.followUpCounts?.due ?? 0;
  return <>
    {scopes.filter(({ key, count }) => count !== undefined && (count > 0 || page.work === key)).map(({ key, label, count }) => (
      <Button key={key} size="small" aria-pressed={page.work === key} onClick={() => {
        page.onWork(key);
        focusSection('today-chase');
      }}>{label} {count} 批</Button>
    ))}
    {due === 0 ? null : <Button size="small" onClick={() => {
      page.onFollowUp('follow_up_due');
      focusSection('today-chase');
    }}>到时跟进 {due} 批</Button>}
  </>;
}

function PlanLink({ plan, onRetry }: { readonly plan: MyPlan | undefined; readonly onRetry: () => void }) {
  if (plan?.kind === 'error') return <Button size="small" onClick={onRetry}>重试排期</Button>;
  if (plan?.kind !== 'ready' || plan.rows.length === 0) return null;
  return <Link to="/today?group=schedule&mine=1">我的到期排期 {plan.rows.length} 项</Link>;
}

function focusSection(id: string): boolean {
  const target = document.getElementById(id);
  if (target === null) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start' });
  return true;
}
