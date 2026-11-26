import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Button, Card, Empty, Flex, Modal, Result, Skeleton, Typography } from 'antd';
import { useCallback, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { TodayResponse } from '@sw/contracts';
import type { BatchFulfillment } from '@sw/domain';
import {
  ArrivalMemos, TodayDrawer, helpStyle, screenStyle, taskIdOf, todayMotionCss, todayViewOf,
  type ActionDetail, type BoardRow, type GroupMode, type OpenForm, type PlanLoad, type QuickAction, type TodayBoard,
} from '../../features/today/index.js';
import { TaskDrawer } from '../../features/plan/index.js';
import type { ActionPageControls } from './ActionControls.js';
import { ActionBoard, isActionFiltered, type ActionLane } from './ActionBoard.js';
import { PendingBatchPagination, pendingBatchCards, pendingBatchRowId, usePendingBatches } from './PendingBatches.js';
import { ScheduleView } from './ScheduleView.js';
import { PageHeader } from '../../shared/ui/page.js';
import { arrivalWork, planTaskCards } from './TodayAgenda.js';
import { arrivalShortcutPath, TodayAgendaShortcuts, TodayLinks, useAgendaJump, type ArrivalTiming } from './TodayLinks.js';
import type { MyPlan } from './use-today-plan.js';
import { WorkspaceCalendar, WorkspaceViewControls, type WorkspaceControls } from './WorkspaceViews.js';
import type { WorkspaceInbox } from './action-query.js';

const NAVIGATION_HELP = 'j k 或方向键移动，Enter 打开';
const ACTION_HELP = `${NAVIGATION_HELP}，d 改期，s 发货，r 收货，n 跟进，e 异常，? 帮助，Esc 关闭`;
const SCHEDULE_HELP = `${NAVIGATION_HELP}，? 帮助，Esc 关闭`;

export type TodayScreenProps = {
  readonly asOf?: TodayResponse['asOf'] | undefined;
  readonly board: TodayBoard;
  readonly workspace?: WorkspaceControls;
  readonly canRecord?: boolean;
  readonly isInternalWorkVisible?: boolean;
  readonly search?: string;
  readonly arrivalsView?: { readonly focusBatch: string | null; readonly timing?: ArrivalTiming } | undefined;
  readonly arrivalMemos?: TodayResponse['arrivalMemos'];
  readonly arrivalFocusId?: string | null;
  readonly pendingFocusId?: string | null;
  readonly pendingBatch?: TodayResponse['pendingBatch'];
  readonly onPendingBatchChanged?: () => Promise<boolean>;
  readonly actionBoard?: TodayBoard;
  readonly actionPage?: ActionPageControls | undefined;
  readonly batchSeqOf?: ((rowId: string) => number | undefined) | undefined;
  readonly fulfillmentOf?: ((rowId: string) => BatchFulfillment | undefined) | undefined;
  readonly detailOf?: (id: string) => ActionDetail | undefined;
  readonly myPlan?: MyPlan | undefined;
  readonly plan?: PlanLoad;
  readonly isMyPlan?: boolean;
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
  readonly onCloseHelp?: () => void;
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
  const title = props.arrivalsView === undefined ? '个人工作台' : '在途待收';
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
        title={props.arrivalsView === undefined ? '个人工作台没有读出来' : '在途待收没有读出来'}
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
  if (props.arrivalsView !== undefined) return <ArrivalsPane memos={props.arrivalMemos ?? []} view={props.arrivalsView} search={props.search ?? ''} />;
  const isSchedule = view === 'schedule';
  return (
    <section className={isSchedule ? undefined : 'today-workspace-screen'} style={screenStyle()}>
      <style>{todayMotionCss()}</style>
      <PageHeader title={isSchedule ? '今日排期' : '个人工作台'} />
      {isSchedule ? <SchedulePane {...props} /> : <ActionPane {...props} />}
      <PageDrawers {...props} />
      <ShortcutHelp isOpen={props.isHelpOpen} isNavigationOnly={isSchedule || props.canRecord === false} onClose={props.onCloseHelp ?? noop} />
      <div role="status" style={helpStyle()}>{props.notice}</div>
    </section>
  );
}

function ShortcutHelp({ isOpen, isNavigationOnly, onClose }: { readonly isOpen: boolean; readonly isNavigationOnly: boolean; readonly onClose: () => void }) {
  return <Modal title="快捷键帮助" open={isOpen} onCancel={onClose} footer={null} centered destroyOnHidden closable={{ 'aria-label': '关闭快捷键帮助' }}>
    {isOpen ? <Typography.Paragraph>{isNavigationOnly ? SCHEDULE_HELP : ACTION_HELP}</Typography.Paragraph> : null}
  </Modal>;
}

function ArrivalsPane({ memos, view, search }: { readonly memos: TodayResponse['arrivalMemos']; readonly view: NonNullable<TodayScreenProps['arrivalsView']>; readonly search: string }): ReactNode {
  const returnSearch = new URLSearchParams(search).get('actionReturn') ?? '';
  const returnPath = returnSearch === '' ? '/today' : '/today?' + new URLSearchParams(returnSearch);
  const rows = view.timing === undefined ? memos : memos.filter((memo) => memo.status === view.timing);
  const title = view.timing === 'overdue' ? '到仓逾期' : view.timing === 'due_today' ? '今日应到' : '在途待收';
  return <section style={screenStyle()}>
    <PageHeader title={title} />
    <Flex align="center" gap="small" wrap><Link to={returnPath}>返回个人工作台</Link>
      {view.timing === undefined ? null : <Link to={arrivalShortcutPath({ returnSearch })}>查看全部在途</Link>}<ProcurementCutoff />
    </Flex>
    <Card size="small">
      {rows.length === 0 ? <Empty description={`当前没有${title}批次。`} />
        : <ArrivalMemos memos={rows} today={{ focusBatch: view.focusBatch, title: view.timing === undefined ? '待收批次' : title }} />}
    </Card>
  </section>;
}

function ActionPane(props: TodayScreenProps): ReactNode {
  const { board, actionPage: page, workspace } = props;
  const summary = actionSummary(props);
  const inbox = workspace?.inbox ?? 'today';
  const { navigation, jump } = useBoardNavigation(props, inbox);
  const pending = usePendingBatches({
    rows: summary.pendingRows,
    focusId: summary.pendingFocusId,
    canFocus: page?.isSettled !== false,
    onChanged: props.onPendingBatchChanged,
  });
  const receipts = arrivalWork(summary.arrivals, board.body.kind === 'groups' ? board.body.rows : []);
  const display = actionDisplay(props);
  return <>
    <TodayLinks page={page} asOf={props.asOf}
      myPlan={props.myPlan} onRetryPlan={summary.onRetryPlan} inbox={inbox} onInbox={workspace?.onInbox ?? noop} />
    <div role="status" style={pending.notice === '' ? { position: 'absolute' } : helpStyle()}>{pending.notice}</div>
    <ActionBoard {...props} {...navigation} page={page} receiptOf={(id) => receipts.get(id)}
      internalCards={[...planTaskCards({ tasks: summary.tasks, focus: props.focus, onOpen: props.onOpen }), ...pendingBatchCards(pending, props.focus)]}
      internalPagination={<PendingBatchPagination view={pending} />} {...display}
      utilityLinks={<ActionDestinations inbox={inbox} pendingCount={pending.total} page={page} myPlan={props.myPlan} jump={jump} />} />
  </>;
}

function ActionDestinations({ inbox, pendingCount, page, myPlan, jump }: {
  readonly inbox: WorkspaceInbox;
  readonly pendingCount: number;
  readonly page: ActionPageControls | undefined;
  readonly myPlan: MyPlan | undefined;
  readonly jump: (id: string) => void;
}) {
  if (inbox !== 'today') return null;
  const planCount = myPlan?.kind === 'ready' ? myPlan.rows.length : undefined;
  return <TodayAgendaShortcuts pendingCount={page?.paging.pendingCount ?? pendingCount} planCount={planCount} jump={jump} />;
}

function useBoardNavigation(props: TodayScreenProps, inbox: WorkspaceInbox) {
  const { workspace, actionPage } = props;
  const [laneSelection, setLaneSelection] = useState<{ readonly inbox: WorkspaceInbox; readonly lane: ActionLane }>();
  const selectLane = useCallback((lane: ActionLane) => setLaneSelection({ inbox, lane }), [inbox]);
  const showAgenda = useCallback(() => {
    if (workspace?.view === 'board') selectLane('internal');
  }, [selectLane, workspace?.view]);
  const { jump, jumpId } = useAgendaJump({ page: actionPage, onShow: showAgenda, onReset: () => workspace?.onInbox('today') });
  const selectedLane = laneSelection?.inbox === inbox ? laneSelection.lane : undefined;
  return { jump, navigation: {
    boardFocusId: boardFocusId(props), selectedLane: jumpId === null ? selectedLane : 'internal' as const, onSelectLane: selectLane,
  } };
}

function boardFocusId({ pendingFocusId, arrivalFocusId, search }: TodayScreenProps): string | null {
  if (pendingFocusId != null) return pendingBatchRowId(pendingFocusId);
  if (arrivalFocusId != null) return 'batch:' + arrivalFocusId;
  const params = new URLSearchParams(search);
  return params.get('drawer') ?? params.get('focusId');
}

function actionSummary({ isInternalWorkVisible, myPlan, pendingBatch, pendingFocusId, arrivalMemos, onRetryPlan, board, actionPage }: TodayScreenProps) {
  const canShowInternal = isInternalWorkVisible ?? !isActionFiltered({ board, page: actionPage });
  return {
    tasks: canShowInternal && myPlan?.kind === 'ready' ? myPlan.rows : [],
    pendingRows: canShowInternal ? pendingBatch ?? [] : [],
    pendingFocusId: pendingFocusId ?? null,
    arrivals: arrivalMemos ?? [],
    onRetryPlan: onRetryPlan ?? noop,
  };
}

function actionDisplay({ workspace, actionPage, asOf, myPlan }: TodayScreenProps) {
  if (workspace === undefined) return {};
  const calendar = actionPage?.paging.calendar;
  const selectedDate = actionPage?.calendar;
  const date = selectedDate === 'today' ? asOf : selectedDate ?? asOf;
  return {
    viewControls: <WorkspaceViewControls view={workspace.view} onView={workspace.onView} />,
    calendar: workspace.view === 'calendar' && date !== undefined
      ? <WorkspaceCalendar calendar={calendar} date={date} inbox={workspace.inbox} onDay={workspace.onDay}
        todayAdditions={workspace.inbox === 'today' ? calendarAdditions({ actionPage, asOf, myPlan }) : undefined} /> : undefined,
  };
}

function calendarAdditions({ actionPage, asOf, myPlan }: Pick<TodayScreenProps, 'actionPage' | 'asOf' | 'myPlan'>) {
  if (actionPage?.isFiltered !== false || asOf === undefined) return undefined;
  const pending = actionPage.paging.pendingCount;
  const isPartial = myPlan?.kind === 'error' && pending !== undefined;
  const count = pending === undefined ? undefined : myPlan?.kind === 'ready'
    ? pending + myPlan.rows.length : isPartial ? pending : undefined;
  return { day: asOf, count, isPartial };
}

function SchedulePane(props: TodayScreenProps): ReactNode {
  return (
    <ScheduleView
      isMine={props.isMyPlan === true}
      returnSearch={new URLSearchParams(props.search).get('workspaceReturn') ?? ''}
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
        detail={props.drawerId === null ? undefined : props.detailOf?.(props.drawerId)}
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
