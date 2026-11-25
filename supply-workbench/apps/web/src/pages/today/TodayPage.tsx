import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import type { TodaySort } from '@sw/contracts';
import { useCanWrite } from '../../shared/actor.js';
import {
  todayBoard, todayViewOf, withGroup, type OpenForm, type TodayBoard, type Undo,
} from '../../features/today/index.js';
import { actionQuery, actionReasonParams, workspaceDayParams, workspaceInboxParams, workspaceViewParams, type ActionQuery } from './action-query.js';
import { useTodayActionPage } from './use-today-action-page.js';
import { applyNextToday, useTodayData, type TodayLoad } from './today-load.js';
import { focusForRows, handleKey, rowsSettled } from './today-keys.js';
import { restoreReminderLocation, useWorkspaceFocus } from './today-focus.js';
import { openQuick } from './today-open.js';
import { arrivalReturnId, pendingReturnId, screenView, useAppliedPage, useTodaySession } from './today-session.js';
import { TodayScreen, type TodayScreenProps } from './TodayBoard.js';
import { sessionRows, useTodayPlan } from './use-today-plan.js';
import { useUndoMessage } from './use-undo-message.js';
import { restoreTodayWrite, submitForm } from './today-writes.js';
import type { WorkspaceControls } from './WorkspaceViews.js';

export function TodayPage() {
  return <TodayScreen {...useTodayScreen()} />;
}

function useTodayScreen(): TodayScreenProps {
  const route = useWorkspaceRoute();
  const { query, group, arrivalsView, isPlanMode, isMyPlan } = route;
  const today = useTodayData(query);
  const state = useTodayState(today);
  const board = boardOf({ state, group, reasons: query.reasons, sort: query.sort });
  const actionBoard = isPlanMode ? boardOf({ state, group: 'waiting', reasons: query.reasons, sort: query.sort }) : board;
  const plan = useTodayPlan({ group, ownerId: state.buyerId, isMine: isMyPlan, shouldLoad: arrivalsView === undefined });
  const isInternalWorkVisible = showPlanRows({ query, asOf: state.asOf });
  const { actionPage, closeSession, canRecord } = useScreenSession({ state, today, route, board, actionBoard, plan, isInternalWorkVisible });
  useUndoMessage({ undo: state.undo, onRestore: () => { void restoreTodayWrite(state); } });
  return {
    ...screenProps({ state, board, actionBoard, plan, route, closeSession }),
    ...(arrivalsView === undefined ? {} : { isReady: today.isLoadedForQuery || today.loadError !== '', loadError: today.loadError }),
    search: route.search, actionPage, arrivalsView, workspace: workspaceControls({ route, asOf: state.asOf }), myPlan: plan.mine,
    canRecord, pendingFocusId: route.pendingFocusId, arrivalFocusId: route.arrivalFocusId, isMyPlan, isInternalWorkVisible,
  };
}

function useWorkspaceRoute() {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const returnState: unknown = useLocation().state;
  const query = useMemo(() => actionQuery(search), [search]);
  const { group, arrivalsView, workspaceView } = screenView(params);
  return { search, setParams, query, group, arrivalsView, workspaceView, isPlanMode: todayViewOf(group) === 'schedule',
    isMyPlan: params.get('mine') === '1', hasDrawer: params.has('drawer'),
    pendingFocusId: pendingReturnId(returnState), arrivalFocusId: arrivalReturnId(returnState) };
}

type WorkspaceRoute = ReturnType<typeof useWorkspaceRoute>;

function workspaceControls({ route, asOf }: { readonly route: WorkspaceRoute; readonly asOf: string | undefined }): WorkspaceControls {
  const { query, search, setParams, workspaceView } = route;
  return {
    inbox: query.inbox ?? 'today', view: workspaceView,
    onInbox: (inbox) => setParams(workspaceInboxParams(search, inbox)),
    onView: (view) => setParams(workspaceViewParams(search, view)),
    onDay: (date) => {
      if (date === (query.calendar === 'today' ? asOf : query.calendar)) return;
      const destination = query.inbox === 'today' && asOf !== undefined && date > asOf
        ? workspaceInboxParams(search, 'scheduled').toString() : search;
      setParams(workspaceDayParams(destination, date));
    },
  };
}

function showPlanRows({ query, asOf }: { readonly query: ActionQuery; readonly asOf: string | undefined }): boolean {
  return query.inbox === 'today' && query.page === 1 && query.work === undefined && query.reasons.length === 0 && query.sort.kind !== 'bulk'
    && (query.calendar === undefined || query.calendar === 'today' || query.calendar === asOf);
}

function useScreenSession({ state, today, route, board, actionBoard, plan, isInternalWorkVisible }: Omit<ScreenInput, 'closeSession'> & {
  readonly today: ReturnType<typeof useTodayData>;
  readonly isInternalWorkVisible: boolean;
}) {
  const { query, search, setParams, isPlanMode, arrivalsView } = route;
  const canRecord = useCanWrite('records.write');
  const myPlan = isInternalWorkVisible ? plan.mine : undefined;
  const visible = sessionRows({ board, plan, myPlan });
  const isRedirecting = useWorkspaceFocus({
    target: state.drawerId === null && !route.hasDrawer ? query.focusId : null,
    ready: today.isLoadedForQuery, search, query, paging: state.paging, asOf: state.asOf, setParams,
  });
  const loadedPage = today.isLoadedForQuery && !isRedirecting ? state.paging?.page : undefined;
  useAppliedPage({ loadedPage, requested: query.page, search, setParams });
  const isSettled = loadedPage === query.page;
  const actionPage = useTodayActionPage({ query, search, setParams, today, isSettled });
  useRowFocus({ id: query.focusId, state, visible,
    isSettled: rowsSettled({ isReady: isSettled || isPlanMode, isSchedule: isPlanMode, plan: plan.load.kind }) });
  const closeSession = useTodaySession({
    state,
    rows: sessionRows({ board: actionBoard, plan }),
    isReady: isSettled || (isPlanMode && query.focusId === null),
  });
  useTodayKeys({ state, visible, isSettled, isPlanMode, isArrivalsView: arrivalsView !== undefined, closeSession, canRecord });
  return { actionPage, closeSession, canRecord };
}

function useRowFocus({ id, state, visible, isSettled }: {
  readonly id: string | null;
  readonly state: ReturnType<typeof useTodayState>;
  readonly visible: readonly { readonly id: string }[];
  readonly isSettled: boolean;
}) {
  const { setFocus } = state;
  const isFocusVisible = isSettled && id !== null && visible.some((row) => row.id === id);
  useEffect(() => { if (isFocusVisible) setFocus(id); }, [isFocusVisible, id, setFocus]);
  const nextFocusId = focusForRows({ focus: state.focus, rows: visible, isSettled });
  if (nextFocusId !== state.focus) setFocus(nextFocusId);
}

const EMPTY_PAGE: Omit<TodayLoad, 'counts' | 'paging' | 'asOf'> & { readonly paging: undefined; readonly asOf: undefined } = {
  items: [], arrivalMemos: [], pendingBatch: [], targets: {}, noteRefs: {}, details: {}, buyerName: '', buyerId: null, paging: undefined, asOf: undefined,
};

function useTodayState(today: ReturnType<typeof useTodayData>) {
  const data = today.data;
  const [focus, setFocus] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [isHelpOpen, setHelp] = useState(false);
  const [draft, setDraft] = useState<OpenForm | null>(null);
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setSaving] = useState(false);
  const snapshot = data ?? EMPTY_PAGE;
  return {
    ...snapshot,
    isReady: data !== null || today.loadError !== '',
    loadError: data === null ? today.loadError : '',
    refresh: today.refresh,
    retry: today.retry,
    focus, setFocus, drawerId, setDrawerId, undo, setUndo, isHelpOpen, setHelp, draft, setDraft, saveError, setSaveError, notice, setNotice, isSaving, setSaving,
  };
}

function boardOf({ state, sort, group, reasons }: {
  readonly state: ReturnType<typeof useTodayState>;
  readonly sort: TodaySort;
  readonly group: string;
  readonly reasons: readonly string[];
}): TodayBoard {
  return todayBoard({
    items: state.items, reasons, group, buyerName: state.buyerName,
    receiptActionIds: new Set(state.arrivalMemos.filter((memo) => memo.status !== 'in_transit').map((memo) => 'batch:' + memo.batchId)),
    ...(state.paging === undefined ? {} : { page: { reasonCounts: state.paging.reasonCounts, sort } }),
  });
}

function useTodayKeys(input: {
  readonly state: ReturnType<typeof useTodayState>;
  readonly visible: readonly { readonly id: string }[];
  readonly isSettled: boolean;
  readonly isPlanMode: boolean;
  readonly isArrivalsView: boolean;
  readonly closeSession: ReturnType<typeof useTodaySession>;
  readonly canRecord: boolean;
}): void {
  const { state, visible, isSettled, isPlanMode, isArrivalsView, closeSession, canRecord } = input;
  useEffect(() => {
    if (isArrivalsView) return;
    const onKey = (event: KeyboardEvent) => handleKey({
      event,
      rows: isSettled || isPlanMode ? visible : [],
      focus: state.focus,
      hasDraft: state.draft !== null,
      isPlanMode,
      actions: {
        setFocus: state.setFocus,
        toggleHelp: () => state.setHelp((value) => !value),
        closeDraft: () => closeSession(state.drawerId),
        closeDrawer: () => { if (state.drawerId !== null) closeSession(null); },
        openDrawer: () => {
          if (state.focus === null) return;
          state.setDrawerId(state.focus);
          state.setDraft(null);
        },
        open: (kind) => {
          if (state.focus === null || !canRecord) return;
          openQuick({ id: state.focus, kind, targets: state.targets, noteRefs: state.noteRefs, setFocus: state.setFocus, setDraft: state.setDraft, setDrawerId: state.setDrawerId, setSaveError: state.setSaveError });
        },
      },
    });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, visible, isSettled, isPlanMode, isArrivalsView, closeSession, canRecord]);
}

type ScreenInput = {
  readonly state: ReturnType<typeof useTodayState>;
  readonly board: TodayBoard;
  readonly actionBoard: TodayBoard;
  readonly plan: ReturnType<typeof useTodayPlan>;
  readonly route: WorkspaceRoute;
  readonly closeSession: ReturnType<typeof useTodaySession>;
};

function screenProps(input: ScreenInput): TodayScreenProps {
  const { state, board, actionBoard, route, plan, closeSession } = input;
  const { search, query, setParams } = route;
  return {
    board, asOf: state.asOf,
    arrivalMemos: state.arrivalMemos,
    pendingBatch: state.pendingBatch,
    onPendingBatchChanged: () => applyNextToday(state),
    actionBoard,
    batchSeqOf: (rowId) => state.targets[rowId]?.batchSeq,
    fulfillmentOf: (rowId) => state.targets[rowId]?.fulfillment,
    detailOf: (id) => state.details[id],
    plan: plan.load,
    onRetryPlan: plan.reload,
    onTaskChanged: plan.reload,
    focus: state.focus, fading: null, drawerId: state.drawerId, draft: state.draft, saveError: state.saveError,
    hadDate: state.drawerId !== null && state.targets[state.drawerId]?.hadDate === true,
    lane: state.drawerId === null ? 'finished' : (state.targets[state.drawerId]?.lane ?? 'finished'),
    isSaving: state.isSaving,
    notice: state.notice,
    isHelpOpen: state.isHelpOpen,
    isReady: state.isReady,
    loadError: state.loadError,
    onToggleReason: (code) => setParams(actionReasonParams(search, code)),
    onGroup: (group) => setParams(new URLSearchParams(withGroup({ search, group }))),
    onOpen: (id) => { state.setDrawerId(id); state.setFocus(id); state.setDraft(null); state.setSaveError(''); },
    onQuick: ({ id, kind }) => openQuick({ id, kind, targets: state.targets, noteRefs: state.noteRefs, setFocus: state.setFocus, setDraft: state.setDraft, setDrawerId: state.setDrawerId, setSaveError: state.setSaveError }),
    onCopy: (text) => { void copyNudge(text, state.setNotice); },
    onCloseDrawer: () => closeSession(null),
    onDraft: state.setDraft,
    onSubmit: () => { void submitForm({
      state, close: () => closeSession(null),
      onReminderChanged: (id) => restoreReminderLocation({ id, search, query, onLocate: (next) => closeSession(null, next) }),
    }); },
    onRetry: state.retry,
    onBack: () => window.history.back(),
  };
}

async function copyNudge(text: string, setNotice: (notice: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    setNotice('已复制催办文本');
  } catch {
    setNotice('复制失败');
  }
}
