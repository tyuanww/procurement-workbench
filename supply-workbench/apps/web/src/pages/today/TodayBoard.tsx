import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Button, Card, Empty, Flex, Modal, Result, Typography } from 'antd';
import { useCallback, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { TodayResponse } from '@sw/contracts';
import type { BatchFulfillment } from '@sw/domain';
import {
  ArrivalMemos, TodayDrawer, arrivalShortcutPath, helpStyle, screenStyle, taskIdOf, todayMotionCss, todayViewOf,
  type ActionDetail, type ArrivalTiming, type BoardRow, type GroupMode, type OpenForm, type PlanLoad, type QuickAction, type ReceiptWork, type TodayBoard,
} from '../../features/today/index.js';
import { TaskDrawer } from '../../features/plan/index.js';
import type { ActionPageControls } from './ActionControls.js';
import { ActionBoard, isActionFiltered, isBusinessDay, type ActionBoardProps, type ActionLane } from './ActionBoard.js';
import { PENDING_BATCH_TARGET, PendingBatchPagination, pendingBatchCards, pendingBatchRowId, usePendingBatches } from './PendingBatches.js';
import { ScheduleView } from './ScheduleView.js';
import { PageHeader } from '../../shared/ui/page.js';
import { PLAN_TASK_TARGET, arrivalWork, planTaskCards } from './TodayAgenda.js';
import { TodayAgendaShortcuts, TodayLinks, useAgendaJump } from './TodayLinks.js';
import { TodayLoadingCard } from './TodayLoadingCard.js';
import { TodayActionSummary } from './TodayActionSummary.js';
import { ActionAssistant } from './ActionAssistant.js';
import { TodaySectionNavigation } from './TodaySectionNavigation.js';
import { focusSection } from './today-focus.js';
import type { CalendarBusinessDayPreview } from './use-calendar-business-day.js';
import type { MyPlan } from './use-today-plan.js';
import { WorkspaceCalendar, WorkspaceViewControls, type WorkspaceControls } from './WorkspaceViews.js';
import type { WorkspaceFilterSelection, WorkspaceInbox } from './action-query.js';

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
  readonly calendarBusinessDay?: CalendarBusinessDayPreview | undefined;
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
  readonly onApplyFilters?: (selection: WorkspaceFilterSelection) => void;
  readonly onOpenArrivals?: (path: string) => void;
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
  const view = todayViewOf(props.board.group);
  if (props.arrivalsView === undefined) return <section className="today-workspace-screen" style={screenStyle()}>
    <style>{todayMotionCss()}</style>
    <PageHeader title={view === 'schedule' ? '今日排期' : '个人工作台'} />
    <TodaySectionNavigation view={view} search={props.search ?? ''}>
      <WorkspaceBody {...props} />
    </TodaySectionNavigation>
  </section>;
  if (!props.isReady || props.loadError !== '') return <section style={screenStyle()}>
    <PageHeader title="在途待收" />
    {props.isReady ? <TodayError {...props} /> : <TodayLoadingCard label="正在读取在途待收" />}
  </section>;
  return <ArrivalsPane memos={props.arrivalMemos ?? []} view={props.arrivalsView} search={props.search ?? ''} />;
}

function TodayError(props: TodayScreenProps): ReactNode {
  return <Result
        status="error"
        title={props.arrivalsView === undefined ? '个人工作台没有读出来' : '在途待收没有读出来'}
        subTitle={props.loadError}
        extra={[
          <Button key="retry" type="primary" onClick={props.onRetry}>重试</Button>,
          <Button key="back" onClick={props.onBack}>返回</Button>,
        ]}
      />;
}

function WorkspaceBody(props: TodayScreenProps): ReactNode {
  const isSchedule = todayViewOf(props.board.group) === 'schedule';
  if (!isSchedule && !props.isReady) return <TodayLoadingCard label="正在读取个人工作台" />;
  if (!isSchedule && props.loadError !== '') return <TodayError {...props} />;
  const receipts = workspaceReceipts(props);
  return (
    <>
      {isSchedule ? <SchedulePane {...props} /> : <ActionPane {...props} receipts={receipts} />}
      <PageDrawers {...props} receipt={props.drawerId === null ? undefined : receipts.get(props.drawerId)} />
      <ShortcutHelp isOpen={props.isHelpOpen} isNavigationOnly={isSchedule || props.canRecord === false} onClose={props.onCloseHelp ?? noop} />
      <div role="status" style={helpStyle()}>{props.notice}</div>
    </>
  );
}

function workspaceReceipts({ board, arrivalMemos }: Pick<TodayScreenProps, 'board' | 'arrivalMemos'>) {
  return arrivalWork(arrivalMemos ?? [], board.body.kind === 'groups' ? board.body.rows : []);
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
    <style>{todayMotionCss()}</style>
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

function ActionPane(props: TodayScreenProps & { readonly receipts: ReadonlyMap<string, ReceiptWork> }): ReactNode {
  const { actionPage: page, workspace, receipts } = props;
  const summary = actionSummary(props);
  const inbox = workspace?.inbox ?? 'today';
  const { navigation, jump } = useBoardNavigation(props, inbox);
  const pending = usePendingBatches({
    rows: summary.pendingRows,
    focusId: summary.pendingFocusId,
    canFocus: page?.isSettled !== false,
    onChanged: props.onPendingBatchChanged,
  });
  const display = actionDisplay(props);
  const overview = actionOverview({ props, jump, receipts });
  return <>
    {overview.metrics}
    <div role="status" style={pending.notice === '' ? { position: 'absolute' } : helpStyle()}>{pending.notice}</div>
    <ActionBoard {...props} {...navigation} page={page} receiptOf={(id) => receipts.get(id)}
      internalCards={[...planTaskCards({ tasks: summary.tasks, focus: props.focus, onOpen: props.onOpen }), ...pendingBatchCards(pending, props.focus)]}
      internalPagination={<PendingBatchPagination view={pending} />} {...display}
      scopeControls={<TodayLinks page={page}
      myPlan={props.myPlan} onRetryPlan={summary.onRetryPlan} inbox={inbox} onInbox={workspace?.onInbox ?? noop}
      onBusinessDay={workspace?.onBusinessDay} />}
      shortcuts={overview.shortcuts}
      utilityLinks={actionDestinations({ inbox, pendingCount: pending.total, page, myPlan: props.myPlan, jump, hasPlanShortcut: overview.shortcuts !== undefined, hasPendingSummary: overview.metrics !== undefined })} />
  </>;
}

function actionOverview({ props, jump, receipts }: { readonly props: TodayScreenProps; readonly jump: (id: string) => void; readonly receipts: ReadonlyMap<string, ReceiptWork> }) {
  const { actionPage: page, asOf, onOpenArrivals, search = '' } = props;
  if (page === undefined || !isBusinessDay({ page, asOf }) || onOpenArrivals === undefined) return {};
  return {
    metrics: <TodayActionSummary page={page} search={search} onArrivals={onOpenArrivals} onPending={() => jump(PENDING_BATCH_TARGET)} />,
    shortcuts: props.workspace?.view === 'list' ? actionShortcuts({ props, page, jump, receipts }) : undefined,
  };
}

function actionShortcuts({ props, page, jump, receipts }: { readonly props: TodayScreenProps; readonly page: ActionPageControls; readonly jump: (id: string) => void; readonly receipts: ReadonlyMap<string, ReceiptWork> }) {
  const { myPlan } = props;
  return <ActionAssistant board={props.board} page={page} receipts={receipts}
    planCount={myPlan?.kind === 'ready' ? myPlan.rows.length : undefined}
    onOverdue={() => filterActionReason(props, 'overdue')} onFollowUp={() => filterActionReason(props, 'follow_up_due')}
    onPlan={() => jump(PLAN_TASK_TARGET)} />;
}

function filterActionReason(props: TodayScreenProps, reason: 'overdue' | 'follow_up_due') {
  props.onApplyFilters?.({ reasons: [reason], work: props.actionPage?.work, sort: props.actionPage?.sort ?? { kind: 'urgency' }, group: undefined });
  focusSection('today-chase');
}

function actionDestinations({ inbox, pendingCount, page, myPlan, jump, hasPlanShortcut, hasPendingSummary }: {
  readonly inbox: WorkspaceInbox;
  readonly pendingCount: number;
  readonly page: ActionPageControls | undefined;
  readonly myPlan: MyPlan | undefined;
  readonly jump: (id: string) => void;
  readonly hasPlanShortcut: boolean;
  readonly hasPendingSummary: boolean;
}): ActionBoardProps['utilityLinks'] {
  if (inbox !== 'today') return undefined;
  const planCount = !hasPlanShortcut && myPlan?.kind === 'ready' ? myPlan.rows.length : undefined;
  const pendingRows = hasPendingSummary ? 0 : page?.paging.pendingCount ?? pendingCount;
  if (!planCount && pendingRows === 0) return undefined;
  return (afterClose) => <TodayAgendaShortcuts pendingCount={pendingRows} planCount={planCount}
    jump={(id) => afterClose(() => jump(id))} />;
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

function boardFocusId({ pendingFocusId, arrivalFocusId, search, focus }: TodayScreenProps): string | null {
  if (pendingFocusId != null) return pendingBatchRowId(pendingFocusId);
  if (arrivalFocusId != null) return 'batch:' + arrivalFocusId;
  const params = new URLSearchParams(search);
  return params.get('drawer') ?? params.get('focusId') ?? focus;
}

function actionSummary({ isInternalWorkVisible, myPlan, pendingBatch, pendingFocusId, onRetryPlan, board, actionPage }: TodayScreenProps) {
  const canShowInternal = isInternalWorkVisible ?? !isActionFiltered({ board, page: actionPage });
  return {
    tasks: canShowInternal && myPlan?.kind === 'ready' ? myPlan.rows : [],
    pendingRows: canShowInternal ? pendingBatch ?? [] : [],
    pendingFocusId: pendingFocusId ?? null,
    onRetryPlan: onRetryPlan ?? noop,
  };
}

function actionDisplay({ workspace, actionPage, asOf, myPlan, calendarBusinessDay }: TodayScreenProps) {
  if (workspace === undefined) return {};
  const calendar = actionPage?.paging.calendar;
  const selectedDate = actionPage?.calendar;
  const date = selectedDate === 'today' ? asOf : selectedDate ?? asOf;
  const todayAdditions = workspace.view === 'calendar' && workspace.inbox === 'today' ? calendarAdditions({ actionPage, asOf, myPlan }) : undefined;
  return {
    viewControls: <WorkspaceViewControls view={workspace.view} onView={workspace.onView} />,
    calendar: workspace.view === 'calendar' && date !== undefined
      ? <WorkspaceCalendar calendar={calendar} date={date} inbox={workspace.inbox} onDay={workspace.onDay}
        todayAdditions={todayAdditions} businessDay={calendarBusinessDay} /> : undefined,
    calendarTodayAdditions: todayAdditions,
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
      group={props.board.group}
      load={props.plan ?? { kind: 'idle' }}
      focus={props.focus}
      onGroup={props.onGroup}
      onOpen={props.onOpen}
      onRetry={props.onRetryPlan ?? noop}
    />
  );
}

function PageDrawers(props: TodayScreenProps & { readonly receipt: ReceiptWork | undefined }): ReactNode {
  const taskId = taskIdOf(props.drawerId);
  return (
    <>
      <TodayDrawer
        row={openRow(props.actionBoard ?? props.board, props.drawerId)}
        detail={props.drawerId === null ? undefined : props.detailOf?.(props.drawerId)}
        batchSeq={props.drawerId === null ? undefined : props.batchSeqOf?.(props.drawerId)}
        fulfillment={props.drawerId === null ? undefined : props.fulfillmentOf?.(props.drawerId)}
        receipt={props.receipt}
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
