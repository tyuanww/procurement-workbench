import { Button, Result, Skeleton, Tabs } from 'antd';
import type { ReactNode } from 'react';
import type { TodayResponse } from '@sw/contracts';
import { ArrivalMemos, groupForView, taskIdOf, todayViewFromKey, todayViewOf, type BoardRow, type GroupMode, type PlanLoad, type QuickAction, type TodayBoard, type TodayInsight, type TodayView } from '../../features/today/index.js';
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
const VIEW_TABS: readonly { readonly key: TodayView; readonly label: string }[] = [
  { key: 'action', label: '行动板' },
  { key: 'schedule', label: '排期' },
];

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
      <PageHeader title="今日" />
      <Skeleton active paragraph={{ rows: 8 }} />
    </section>
  );
}

function TodayError(props: TodayScreenProps): ReactNode {
  return (
    <section style={screenStyle()}>
      <PageHeader title="今日" />
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
      <PageHeader title="今日" />
      <TodayViewTabs view={view} onGroup={props.onGroup} />
      {view === 'schedule' ? <SchedulePane {...props} /> : <ActionPane {...props} />}
      <PageDrawers {...props} />
      <TodayStatus isHelpOpen={props.isHelpOpen} notice={props.notice} focus={props.focus} />
    </section>
  );
}

function TodayViewTabs(props: { readonly view: TodayView; readonly onGroup: (group: GroupMode) => void }): ReactNode {
  return (
    <Tabs
      activeKey={props.view}
      items={VIEW_TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
      onChange={(key) => props.onGroup(groupForView(todayViewFromKey(key)))}
    />
  );
}

function ActionPane(props: TodayScreenProps): ReactNode {
  return (
    <>
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
      <PendingBatches rows={props.pendingBatch ?? []} onChanged={props.onPendingBatchChanged} />
      <ArrivalMemos memos={props.arrivalMemos ?? []} />
    </>
  );
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
      <TaskDrawer workItemId={taskId} isOpen={taskId !== null} onClose={props.onCloseDrawer} onChanged={props.onTaskChanged ?? noop} />
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
