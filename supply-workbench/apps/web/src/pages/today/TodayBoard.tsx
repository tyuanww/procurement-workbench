import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Button, Card, Empty, Flex, Result, Skeleton } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { TodayResponse } from '@sw/contracts';
import type { BatchFulfillment } from '@sw/domain';
import {
  ArrivalMemos, TodayDrawer, helpStyle, screenStyle, taskIdOf, todayMotionCss, todayViewOf,
  type ActionDetail, type BoardRow, type GroupMode, type OpenForm, type PlanLoad, type QuickAction, type TodayBoard,
} from '../../features/today/index.js';
import { TaskDrawer } from '../../features/plan/index.js';
import type { ActionPageControls } from './ActionControls.js';
import { ActionBoard, isActionFiltered, isKanban } from './ActionBoard.js';
import { PendingBatches, PendingBatchPagination, pendingBatchCards, usePendingBatches, type PendingBatchView } from './PendingBatches.js';
import { ScheduleView } from './ScheduleView.js';
import { PageHeader } from '../../shared/ui/page.js';
import { arrivalWork, planTaskCards, ReceiptTask, TodayAgenda } from './TodayAgenda.js';
import { arrivalShortcutPath, TodayLinks, type ArrivalTiming } from './TodayLinks.js';
import type { MyPlan } from './use-today-plan.js';

const NAVIGATION_HELP = 'j k 或方向键移动，Enter 打开';
const ACTION_HELP = `${NAVIGATION_HELP}，d 改期，s 发货，r 收货，n 跟进，e 异常，? 帮助，Esc 关闭`;
const SCHEDULE_HELP = `${NAVIGATION_HELP}，? 帮助，Esc 关闭`;

export type TodayScreenProps = {
  readonly asOf?: TodayResponse['asOf'] | undefined;
  readonly board: TodayBoard;
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
  readonly buyerName?: string;
  readonly detailOf?: (id: string) => ActionDetail | undefined;
  readonly myPlan?: MyPlan;
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
  if (props.arrivalsView !== undefined) return <ArrivalsPane memos={props.arrivalMemos ?? []} view={props.arrivalsView} search={props.search ?? ''} />;
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

function ArrivalsPane({ memos, view, search }: { readonly memos: TodayResponse['arrivalMemos']; readonly view: NonNullable<TodayScreenProps['arrivalsView']>; readonly search: string }): ReactNode {
  const returnSearch = new URLSearchParams(search).get('actionReturn') ?? '';
  const returnPath = returnSearch === '' ? '/today' : '/today?' + new URLSearchParams(returnSearch);
  const rows = view.timing === undefined ? memos : memos.filter((memo) => memo.status === view.timing);
  const title = view.timing === 'overdue' ? '到仓逾期' : view.timing === 'due_today' ? '今日应到' : '在途待收';
  return <section style={screenStyle()}>
    <PageHeader title={title} />
    <Flex align="center" gap="small" wrap><Link to={returnPath}>返回行动板</Link>
      {view.timing === undefined ? null : <Link to={arrivalShortcutPath({ returnSearch })}>查看全部在途</Link>}<ProcurementCutoff />
    </Flex>
    <Card size="small">
      {rows.length === 0 ? <Empty description={`当前没有${title}批次。`} />
        : <ArrivalMemos memos={rows} today={{ focusBatch: view.focusBatch, title: view.timing === undefined ? '待收批次' : title }} />}
    </Card>
  </section>;
}

function ActionPane(props: TodayScreenProps): ReactNode {
  const { board, actionPage: page, arrivalMemos: arrivals = [], pendingBatch: pendingRows = [], pendingFocusId = null, buyerName = '', search = '', onRetryPlan = noop } = props;
  const isShowingKanban = isKanban({ board, page });
  const isFiltered = isActionFiltered({ board, page });
  const pending = usePendingBatches({
    rows: pendingRows,
    focusId: pendingFocusId,
    canFocus: page?.isSettled !== false,
    onChanged: props.onPendingBatchChanged,
  });
  return <>
    <TodayLinks pending={pending.total} arrivals={arrivals} page={page} buyerName={buyerName} asOf={props.asOf}
      isPendingFiltered={isShowingKanban && isFiltered} myPlan={props.myPlan} onRetryPlan={onRetryPlan} returnSearch={search} />
    <div role="status" style={pending.notice === '' ? { position: 'absolute' } : helpStyle()}>{pending.notice}</div>
    <ActionWorkspace screen={props} isShowingKanban={isShowingKanban} isFiltered={isFiltered} arrivals={arrivals} pending={pending} />
  </>;
}

function ActionWorkspace({ screen, pending, isShowingKanban, isFiltered, arrivals }: {
  readonly screen: TodayScreenProps;
  readonly pending: PendingBatchView;
  readonly isShowingKanban: boolean;
  readonly isFiltered: boolean;
  readonly arrivals: TodayResponse['arrivalMemos'];
}) {
  const { separateArrivals, tasks, renderArrival, focusArrivalId } = actionAgenda({ screen, arrivals, isFiltered });
  const { onOpen } = screen;
  const hasAgenda = !isShowingKanban && (separateArrivals.length > 0 || tasks.length > 0);
  return (
    <div className={hasAgenda ? 'today-action-layout today-action-layout-aside' : 'today-action-layout'}>
      <Flex vertical gap="middle">
        <ActionBoard board={screen.board} page={screen.actionPage} batchSeqOf={screen.batchSeqOf} focus={screen.focus} fading={screen.fading}
          hasOtherWork={pending.total > 0 || hasAgenda}
          kanbanExtras={isShowingKanban && !isFiltered ? {
            receipt: { cards: receiptTaskCards(separateArrivals, focusArrivalId) },
            internal: { cards: [...planTaskCards(tasks, onOpen), ...pendingBatchCards(pending)], footer: <PendingBatchPagination view={pending} isCompact /> },
          } : undefined}
          renderArrival={renderArrival}
          onToggleReason={screen.onToggleReason} onGroup={screen.onGroup} onOpen={onOpen} onQuick={screen.onQuick} onCopy={screen.onCopy} />
        {isShowingKanban ? null : <PendingBatches view={pending} />}
      </Flex>
      {hasAgenda ? <TodayAgenda arrivals={separateArrivals} tasks={tasks} focusArrivalId={focusArrivalId} onOpen={onOpen} /> : null}
    </div>
  );
}

function actionAgenda({ screen, arrivals, isFiltered }: {
  readonly screen: TodayScreenProps;
  readonly arrivals: TodayResponse['arrivalMemos'];
  readonly isFiltered: boolean;
}) {
  const { board, myPlan, arrivalFocusId: focusArrivalId = null } = screen;
  const work = arrivalWork(arrivals, board.body.kind === 'groups' ? board.body.rows : []);
  return {
    focusArrivalId,
    separateArrivals: isFiltered ? [] : work.separate,
    tasks: !isFiltered && myPlan?.kind === 'ready' ? myPlan.rows : [],
    renderArrival: (rowId: string) => {
      const receipt = work.byActionId.get(rowId);
      return receipt === undefined ? null : <ReceiptTask {...receipt} isFocused={focusArrivalId === receipt.memo.batchId} />;
    },
  };
}

function receiptTaskCards(memos: TodayResponse['arrivalMemos'], focusId: string | null) {
  return memos.map((memo) => <li key={`batch:${memo.batchId}`}>
    <article><Card size="small"><ReceiptTask memo={memo} isFocused={focusId === memo.batchId} isStandalone /></Card></article>
  </li>);
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
