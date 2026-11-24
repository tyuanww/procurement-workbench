import { Button, Flex, Result, Skeleton, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { TodayResponse } from '@sw/contracts';
import { ArrivalMemos, taskIdOf, todayViewOf, type BoardRow, type GroupMode, type PlanLoad, type QuickAction, type TodayBoard, type TodayInsight } from '../../features/today/index.js';
import { TaskDrawer } from '../../features/plan/index.js';
import type { OpenForm } from './TodayForms.js';
import type { ActionPageControls } from './ActionControls.js';
import { ActionBoard } from './ActionBoard.js';
import { PendingBatches } from './PendingBatches.js';
import { ScheduleView } from './ScheduleView.js';
import { TodayDrawer } from './TodayDrawer.js';
import { PageHeader } from '../../shared/ui/page.js';
import { helpStyle, screenStyle, todayMotionCss } from './today-style.js';

const HELP = 'j k 或方向键移动，Enter 打开，d 改期，s 发货，r 收货，n 跟进，e 异常，? 帮助，Esc 关闭';

export type TodayScreenProps = {
  readonly board: TodayBoard;
  readonly arrivalMemos?: TodayResponse['arrivalMemos'];
  readonly pendingBatch?: TodayResponse['pendingBatch'];
  readonly onPendingBatchChanged?: () => Promise<boolean>;
  readonly actionBoard?: TodayBoard;
  readonly actionPage?: ActionPageControls | undefined;
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
  if (!props.isReady) return <TodayLoading />;
  if (props.loadError !== '') return <TodayError {...props} />;
  return <TodayReady {...props} />;
}

function TodayLoading(): ReactNode {
  return (
    <section style={screenStyle()}>
      <PageHeader title="今日事项" />
      <Skeleton active paragraph={{ rows: 8 }} />
    </section>
  );
}

function TodayError(props: TodayScreenProps): ReactNode {
  return (
    <section style={screenStyle()}>
      <PageHeader title="今日事项" />
      <Result
        status="error"
        title="今日没有读出来"
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
  return (
    <section style={screenStyle()}>
      <style>{todayMotionCss()}</style>
      <PageHeader title={view === 'schedule' ? '今日排期' : '行动板'} />
      {view === 'schedule' ? <SchedulePane {...props} /> : <ActionPane {...props} />}
      <PageDrawers {...props} />
      <TodayStatus isHelpOpen={props.isHelpOpen} notice={props.notice} focus={props.focus} />
    </section>
  );
}

function ActionPane(props: TodayScreenProps): ReactNode {
  const pending = props.pendingBatch ?? [];
  const arrivals = props.arrivalMemos ?? [];
  const chaseCount = props.actionPage?.paging.chaseCounts?.all;
  return (
    <>
      <nav className="today-touch" aria-label="今日快捷入口">
        <Flex gap="small" align="center" wrap>
          <SectionJump id="today-chase" name={chaseCount === undefined ? '要催货' : `要催货 ${chaseCount} 批`} />
          <SectionJump id="today-pending-batches" name={`待建批次 ${pending.length} 行`} hasTarget={pending.length > 0} />
          <SectionJump id="today-arrival-memos" name={`到仓待收 ${arrivals.length} 批`} hasTarget={arrivals.length > 0} />
          {props.actionPage === undefined ? null : <FollowUpLinks page={props.actionPage} />}
        </Flex>
      </nav>
      <ActionBoard
        board={props.board}
        page={props.actionPage}
        hasPendingBatch={(props.pendingBatch?.length ?? 0) > 0}
        insight={props.insight}
        focus={props.focus}
        fading={props.fading}
        onToggleReason={props.onToggleReason}
        onGroup={props.onGroup}
        onOpen={props.onOpen}
        onQuick={props.onQuick}
        onCopy={props.onCopy}
      />
      <div id="today-pending-batches" className="today-jump-target" tabIndex={-1}>
        <PendingBatches rows={pending} onChanged={props.onPendingBatchChanged} />
      </div>
      <div id="today-arrival-memos" className="today-jump-target" tabIndex={-1}>
        <ArrivalMemos memos={arrivals} />
      </div>
    </>
  );
}

function SectionJump({ id, name, hasTarget = true }: { readonly id: string; readonly name: string; readonly hasTarget?: boolean }) {
  if (!hasTarget) return <Typography.Text type="secondary">{name}</Typography.Text>;
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

function TodayStatus(props: { readonly isHelpOpen: boolean; readonly notice: string; readonly focus: string | null }): ReactNode {
  return (
    <>
      {props.isHelpOpen ? <p style={helpStyle()}>{HELP}</p> : null}
      {statusText(props.notice, props.focus) === '' ? null : <p style={helpStyle()}>{statusText(props.notice, props.focus)}</p>}
    </>
  );
}

function statusText(notice: string, focus: string | null): string {
  if (notice !== '') return notice;
  if (focus === null) return '用 j k 移动';
  return '';
}

function noop(): void {
  return undefined;
}
