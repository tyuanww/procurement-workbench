import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Button, Card, Empty, Flex, Result, Skeleton } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { TodayResponse, TodayWorkFilter } from '@sw/contracts';
import type { BatchFulfillment } from '@sw/domain';
import { ArrivalMemos, taskIdOf, todayArrivalsPath, todayViewOf, type BoardRow, type GroupMode, type PlanLoad, type QuickAction, type TodayBoard, type TodayInsight } from '../../features/today/index.js';
import { TaskDrawer } from '../../features/plan/index.js';
import type { OpenForm } from './TodayForms.js';
import type { ActionPageControls } from './ActionControls.js';
import { ActionBoard } from './ActionBoard.js';
import { PendingBatches } from './PendingBatches.js';
import { ScheduleView } from './ScheduleView.js';
import { TodayDrawer } from './TodayDrawer.js';
import { PageHeader } from '../../shared/ui/page.js';
import { helpStyle, screenStyle, todayMotionCss } from './today-style.js';

const NAVIGATION_HELP = 'j k 或方向键移动，Enter 打开';
const ACTION_HELP = `${NAVIGATION_HELP}，d 改期，s 发货，r 收货，n 跟进，e 异常，? 帮助，Esc 关闭`;
const SCHEDULE_HELP = `${NAVIGATION_HELP}，? 帮助，Esc 关闭`;

export type TodayScreenProps = {
  readonly board: TodayBoard;
  readonly arrivalsView?: { readonly focusBatch: string | null } | undefined;
  readonly arrivalMemos?: TodayResponse['arrivalMemos'];
  readonly pendingBatch?: TodayResponse['pendingBatch'];
  readonly onPendingBatchChanged?: () => Promise<boolean>;
  readonly actionBoard?: TodayBoard;
  readonly actionPage?: ActionPageControls | undefined;
  readonly batchSeqOf?: ((rowId: string) => number | undefined) | undefined;
  readonly fulfillmentOf?: ((rowId: string) => BatchFulfillment | undefined) | undefined;
  readonly insight: TodayInsight;
  readonly plan?: PlanLoad;
  readonly onRetryPlan?: () => void;
  readonly onTaskChanged?: () => void;
  readonly focus: string | null;
  readonly fading: string | null;
  readonly drawerId: string | null;
  readonly draft: OpenForm | null;
  readonly hadDate: boolean;
  readonly lane: 'finished' | 'material';
  readonly isSaving: boolean;
  readonly notice: string;
  readonly saveError: string;
  readonly isHelpOpen: boolean;
  readonly isReady: boolean;
  readonly loadError: string;
  readonly onToggleReason: (code: string) => void;
  readonly onGroup: (group: GroupMode) => void;
  readonly onOpen: (id: string) => void;
  readonly onQuick: (input: { readonly id: string; readonly kind: QuickAction['kind'] }) => void;
  readonly onCopy: (text: string) => void;
  readonly onCloseDrawer: () => void;
  readonly onDraft: (draft: OpenForm) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
  readonly onBack: () => void;
};

export function TodayScreen(props: TodayScreenProps): ReactNode {
  const title = props.arrivalsView === undefined ? '今日事项' : '在途待收';
  if (props.arrivalsView === undefined && todayViewOf(props.board.group) === 'schedule') return <TodayReady {...props} />;
  if (!props.isReady) return <TodayLoading title={title} />;
  if (props.loadError !== '') return <TodayError {...props} title={title} />;
  return <TodayReady {...props} />;
}

function TodayLoading({ title }: { readonly title: string }): ReactNode {
  return (
    <section style={screenStyle()}>
      <PageHeader title={title} />
      <Skeleton active paragraph={{ rows: 8 }} />
    </section>
  );
}

function TodayError(props: TodayScreenProps & { readonly title: string }): ReactNode {
  return (
    <section style={screenStyle()}>
      <PageHeader title={props.title} />
      <Result
        status="error"
        title={props.arrivalsView === undefined ? '今日没有读出来' : '在途待收没有读出来'}
        subTitle={props.loadError}
        extra={[
          <Button key="retry" type="primary" onClick={props.onRetry}>重试</Button>,
          <Button key="back" onClick={props.onBack}>返回</Button>,
        ]}
      />
    </section>
  );
}

function TodayReady(props: TodayScreenProps): ReactNode {
  const view = todayViewOf(props.board.group);
  if (props.arrivalsView !== undefined) return <ArrivalsPane memos={props.arrivalMemos ?? []} focusBatch={props.arrivalsView.focusBatch} />;
  return (
    <section style={screenStyle()}>
      <style>{todayMotionCss()}</style>
      <PageHeader title={view === 'schedule' ? '今日排期' : '行动板'} />
      {view === 'schedule' ? <SchedulePane {...props} /> : <ActionPane {...props} />}
      <PageDrawers {...props} />
      {props.isHelpOpen ? <p style={helpStyle()}>{view === 'schedule' ? SCHEDULE_HELP : ACTION_HELP}</p> : null}
      <div role="status" style={helpStyle()}>{props.notice}</div>
    </section>
  );
}

function ArrivalsPane({ memos, focusBatch }: { readonly memos: TodayResponse['arrivalMemos']; readonly focusBatch: string | null }): ReactNode {
  return <section style={screenStyle()}>
    <PageHeader title="在途待收" />
    <Flex align="center" gap="small" wrap><Link to="/today">返回行动板</Link><ProcurementCutoff /></Flex>
    <Card size="small">
      {memos.length === 0
        ? <Empty description="当前没有在途待收批次。"><Button href="/lines">去跟进中心</Button></Empty>
        : <ArrivalMemos memos={memos} today={{ focusBatch }} />}
    </Card>
  </section>;
}

function ActionPane(props: TodayScreenProps): ReactNode {
  const pending = props.pendingBatch ?? [];
  const arrivals = props.arrivalMemos ?? [];
  const hasOtherWork = pending.length > 0 || arrivals.length > 0;
  const shouldShowOtherWorkFirst = pending.length > 0 && props.board.body.kind === 'empty' && props.actionPage?.isFiltered !== true;
  const otherWork = pending.length === 0 ? null : <div key="pending" id="today-pending-batches" className="today-jump-target" tabIndex={-1}>
    <PendingBatches rows={pending} onChanged={props.onPendingBatchChanged} />
  </div>;
  const chase = <ActionBoard key="chase" board={props.board} page={props.actionPage}
    hasOtherWork={hasOtherWork} batchSeqOf={props.batchSeqOf} insight={props.insight} focus={props.focus} fading={props.fading}
    onToggleReason={props.onToggleReason} onGroup={props.onGroup} onOpen={props.onOpen} onQuick={props.onQuick} onCopy={props.onCopy} />;
  return (
    <>
      <ActionLinks pending={pending.length} arrivals={arrivals.length} page={props.actionPage} />
      {shouldShowOtherWorkFirst ? [otherWork, chase] : [chase, otherWork]}
    </>
  );
}

function ActionLinks({ pending, arrivals, page }: { readonly pending: number; readonly arrivals: number; readonly page: TodayScreenProps['actionPage'] }) {
  return <Card size="small"><nav className="today-touch" aria-label="今日快捷入口">
    <Flex gap="small" align="center" wrap>
      <WorkLinks page={page} />
      {pending === 0 ? null : <SectionJump id="today-pending-batches" name={`待建批次 ${pending} 行`} />}
      {arrivals === 0 ? null : <Link to={todayArrivalsPath}>在途待收 {arrivals} 批</Link>}
      {page === undefined ? null : <FollowUpLinks page={page} />}
      <ProcurementCutoff />
    </Flex>
  </nav></Card>;
}

function WorkLinks({ page }: { readonly page: TodayScreenProps['actionPage'] }) {
  if (page?.paging.chaseCounts === undefined) return <SectionJump id="today-chase" name="行动清单" />;
  const scopes: readonly { readonly key: TodayWorkFilter; readonly label: string; readonly count: number | undefined }[] = [
    { key: 'factory_chase', label: '要催货', count: page.paging.chaseCounts.all },
    { key: 'internal_note', label: '内部等回单', count: page.paging.internalNoteCount },
  ];
  return scopes.filter(({ key, count }) => count !== undefined && (count > 0 || page.work === key)).map(({ key, label, count }) => (
    <Button key={key} size="small" aria-pressed={page.work === key} onClick={() => {
      page.onWork(key);
      focusSection('today-chase');
    }}>{label} {count} 批</Button>
  ));
}

function SectionJump({ id, name }: { readonly id: string; readonly name: string }) {
  return <Button size="small" href={`#${id}`} onClick={(event) => {
    if (focusSection(id)) event.preventDefault();
  }}>{name}</Button>;
}

function FollowUpLinks({ page }: { readonly page: ActionPageControls }) {
  const counts = page.paging.followUpCounts;
  if (counts === undefined) return null;
  return <>
    {counts.due > 0 ? <Button size="small" onClick={() => {
      page.onFollowUp('follow_up_due');
      focusSection('today-chase');
    }}>到时跟进 {counts.due} 批</Button> : null}
    {counts.scheduled > 0 ? <Button size="small" onClick={() => {
      page.onFollowUp('follow_up_scheduled');
      focusSection('today-chase');
    }}>已约跟进 {counts.scheduled} 批</Button> : null}
  </>;
}

function focusSection(id: string): boolean {
  const target = document.getElementById(id);
  if (target === null) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start' });
  return true;
}

function SchedulePane(props: TodayScreenProps): ReactNode {
  return (
    <ScheduleView
      group={props.board.group}
      load={props.plan ?? { kind: 'idle' }}
      focus={props.focus}
      onGroup={props.onGroup}
      onOpen={props.onOpen}
      onRetry={props.onRetryPlan ?? noop}
    />
  );
}

function PageDrawers(props: TodayScreenProps): ReactNode {
  const taskId = taskIdOf(props.drawerId);
  return (
    <>
      <TodayDrawer
        row={openRow(props.actionBoard ?? props.board, props.drawerId)}
        batchSeq={props.drawerId === null ? undefined : props.batchSeqOf?.(props.drawerId)}
        fulfillment={props.drawerId === null ? undefined : props.fulfillmentOf?.(props.drawerId)}
        onQuick={(kind) => { if (props.drawerId !== null) props.onQuick({ id: props.drawerId, kind }); }}
        isOpen={props.drawerId !== null && taskId === null}
        draft={props.draft}
        hadDate={props.hadDate}
        lane={props.lane}
        isSaving={props.isSaving}
        saveError={props.saveError}
        onClose={props.onCloseDrawer}
        onDraft={props.onDraft}
        onSubmit={props.onSubmit}
      />
      <TaskDrawer workItemId={taskId} isOpen={taskId !== null} showScheduleLink onClose={props.onCloseDrawer} onChanged={props.onTaskChanged ?? noop} />
    </>
  );
}

function openRow(board: TodayBoard, drawerId: string | null): BoardRow | null {
  if (drawerId === null || board.body.kind !== 'groups') return null;
  return board.body.rows.find((row) => row.id === drawerId) ?? null;
}

function noop(): void {
  return undefined;
}
