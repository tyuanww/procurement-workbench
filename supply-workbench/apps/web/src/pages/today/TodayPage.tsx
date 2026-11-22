import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BatchViewSchema, ExceptionViewSchema, FollowUpViewSchema, ReceiptViewSchema, type TodaySort } from '@sw/contracts';
import { apiDelete, apiSend } from '../../shared/api/client.js';
import { businessToday, postReceipt, postShipment } from '../../features/follow-up/index.js';
import {
  readGroup, todayBoard, todayInsights, todayViewOf, withGroup,
  type BoardItem, type TodayBoard,
} from '../../features/today/index.js';
import { confirmedDateBody, formErrors, type NoteRef, type OpenForm, type Target, type Undo } from './TodayForms.js';
import { actionFactoryParams, actionFollowUpParams, actionPageParams, actionQuery, actionReasonParams, actionSortParams } from './action-query.js';
import { reminderChangeOf } from './follow-up-time.js';
import { useChaseCopy } from './today-copy.js';
import { applyNextToday, useTodayData, type TodayLoad } from './today-load.js';
import { focusForRows, handleKey, rowsSettled } from './today-keys.js';
import { openQuick } from './today-open.js';
import { useAppliedPage, useTodaySession } from './today-session.js';
import { TodayScreen, type TodayScreenProps } from './TodayBoard.js';
import { sessionRows, useTodayPlan } from './use-today-plan.js';
import { useUndoMessage } from './use-undo-message.js';

export function TodayPage() {
  const screen = useTodayScreen();
  return <TodayScreen {...screen} />;
}

function useTodayScreen(): TodayScreenProps {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const query = actionQuery(search);
  const today = useTodayData(query);
  const state = useTodayState(today);
  const group = readGroup(search);
  const board = boardOf({ state, group, reasons: query.reasons, sort: query.sort });
  const isPlanMode = todayViewOf(group) === 'schedule';
  const actionBoard = isPlanMode ? boardOf({ state, group: 'waiting', reasons: query.reasons, sort: query.sort }) : board;
  const plan = useTodayPlan(group);
  const visible = sessionRows({ board, plan });
  const loadedPage = today.isLoadedForQuery ? state.paging?.page : undefined;
  useAppliedPage({ loadedPage, requested: query.page, search, setParams });
  const isSettled = loadedPage === query.page;
  const nextFocusId = focusForRows({
    focus: state.focus,
    rows: visible,
    isSettled: rowsSettled({ isReady: isSettled, isSchedule: isPlanMode, plan: plan.load.kind }),
  });
  if (nextFocusId !== state.focus) state.setFocus(nextFocusId);
  useTodaySession({ state, rows: visible, isReady: isSettled });
  useTodayKeys({ state, visible: isSettled || isPlanMode ? visible : [], isPlanMode });
  useUndoMessage({ undo: state.undo, onRestore: () => { void restore(state); } });
  const copy = useChaseCopy({ query, buyerName: state.buyerName });
  return {
    ...screenProps({ state, board, actionBoard, plan, search, setParams }),
    actionPage: state.paging === undefined ? undefined : {
      paging: state.paging, sort: query.sort, isLoading: today.isLoading, isSettled, loadError: today.loadError,
      factoryId: params.get('chaseFactory'),
      isFiltered: query.reasons.length > 0 || query.sort.kind === 'bulk',
      onFactory: (id) => setParams(actionFactoryParams(search, id)),
      onFollowUp: (reason) => setParams(actionFollowUpParams(search, reason)),
      onPage: (page) => setParams(actionPageParams(search, page)),
      onSort: (sort) => setParams(actionSortParams(search, sort)),
      onRetry: state.retry,
      ...copy,
    },
  };
}

const EMPTY_PAGE: Omit<TodayLoad, 'counts' | 'paging'> & { readonly paging: undefined } = {
  items: [], arrivalMemos: [], pendingBatch: [], targets: {}, noteRefs: {}, buyerName: '', paging: undefined,
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
    insight: data === null ? todayInsights([]) : insightOf(data),
    isReady: data !== null || today.loadError !== '',
    loadError: data === null ? today.loadError : '',
    refresh: today.refresh,
    retry: today.retry,
    focus, setFocus, drawerId, setDrawerId, undo, setUndo, isHelpOpen, setHelp, draft, setDraft, saveError, setSaveError, notice, setNotice, isSaving, setSaving,
  };
}

function insightOf(data: TodayLoad) {
  return { total: data.paging.total, urgent: data.paging.urgent, overdue: data.counts.overdue, missingDate: data.counts.missing_date };
}

function boardOf({ state, sort, group, reasons }: {
  readonly state: ReturnType<typeof useTodayState>;
  readonly sort: TodaySort;
  readonly group: string;
  readonly reasons: readonly string[];
}): TodayBoard {
  return todayBoard({
    items: state.items, reasons, group, buyerName: state.buyerName,
    ...(state.paging === undefined ? {} : { page: { reasonCounts: state.paging.reasonCounts, sort } }),
  });
}

function useTodayKeys(input: {
  readonly state: ReturnType<typeof useTodayState>;
  readonly visible: readonly { readonly id: string }[];
  readonly isPlanMode: boolean;
}): void {
  const { state, visible, isPlanMode } = input;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handleKey({
      event,
      rows: visible,
      focus: state.focus,
      hasDraft: state.draft !== null,
      isPlanMode,
      actions: {
        setFocus: state.setFocus,
        toggleHelp: () => state.setHelp((value) => !value),
        closeDraft: () => state.setDraft(null),
        closeDrawer: () => state.setDrawerId(null),
        openDrawer: () => {
          if (state.focus === null) return;
          state.setDrawerId(state.focus);
          state.setDraft(null);
        },
        open: (kind) => {
          if (state.focus === null) return;
          openQuick({ id: state.focus, kind, targets: state.targets, noteRefs: state.noteRefs, setFocus: state.setFocus, setDraft: state.setDraft, setDrawerId: state.setDrawerId, setSaveError: state.setSaveError });
        },
      },
    });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, visible]);
}

type ScreenInput = {
  readonly state: ReturnType<typeof useTodayState>;
  readonly board: TodayBoard;
  readonly actionBoard: TodayBoard;
  readonly plan: ReturnType<typeof useTodayPlan>;
  readonly search: string;
  readonly setParams: ReturnType<typeof useSearchParams>[1];
};

function screenProps(input: ScreenInput): TodayScreenProps {
  const { state, board, actionBoard, search, setParams, plan } = input;
  return {
    board,
    arrivalMemos: state.arrivalMemos,
    pendingBatch: state.pendingBatch,
    onPendingBatchChanged: () => applyNextToday(state),
    actionBoard,
    insight: state.insight,
    plan: plan.load,
    onRetryPlan: plan.reload,
    onTaskChanged: plan.reload,
    focus: state.focus,
    fading: null,
    drawerId: state.drawerId,
    draft: state.draft,
    saveError: state.saveError,
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
    onCloseDrawer: () => { state.setDrawerId(null); state.setDraft(null); state.setSaveError(''); },
    onDraft: state.setDraft,
    onSubmit: () => { void submitForm(state); },
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

async function submitForm(state: ReturnType<typeof useTodayState>): Promise<void> {
  const ready = readySubmit(state);
  if (ready === null) return;
  const errors = formErrors({ draft: ready.draft, hadDate: ready.target?.hadDate === true, today: businessToday() });
  if (errors.length > 0) {
    state.setNotice(errors.join('；'));
    return;
  }
  state.setSaving(true);
  state.setSaveError('');
  try {
    await writeDraft({ ready, state });
  } finally {
    state.setSaving(false);
  }
}

function readySubmit(state: ReturnType<typeof useTodayState>): SaveInput | null {
  const { drawerId: id, draft } = state;
  const row = id === null ? undefined : state.items.find((item) => item.id === id);
  if (id === null || draft === null || row === undefined) return null;
  const target = state.targets[id];
  const note = state.noteRefs[id];
  if (!canSubmit({ draft, target, note })) return null;
  return { draft, target, note, row };
}

async function writeDraft(input: { readonly ready: SaveInput; readonly state: ReturnType<typeof useTodayState> }): Promise<void> {
  const { ready, state } = input;
  try {
    const undo = await saveForm(ready);
    state.setUndo(undo);
    state.setNotice('');
    await applyNextToday({
      ...state,
      close: () => { state.setDrawerId(null); state.setDraft(null); },
    });
  } catch (error) {
    state.setSaveError(error instanceof Error ? error.message : '保存失败');
  }
}

function canSubmit(input: { readonly draft: OpenForm; readonly target: Target | undefined; readonly note: NoteRef | undefined }): boolean {
  if (input.draft.kind === 'note') return input.target !== undefined || input.note !== undefined;
  return input.target !== undefined;
}

type SaveInput = {
  readonly draft: OpenForm;
  readonly target: Target | undefined;
  readonly note: NoteRef | undefined;
  readonly row: BoardItem;
};

async function saveForm(input: SaveInput): Promise<Undo> {
  if (input.draft.kind === 'receipt') return saveReceipt(input);
  if (input.draft.kind === 'ship') return saveShip(input);
  if (input.draft.kind === 'date') return saveDate(input);
  if (input.draft.kind === 'note') return saveNote(input);
  return saveException(input);
}

async function saveReceipt(input: SaveInput): Promise<Undo> {
  const { draft, target, row } = input;
  if (draft.kind !== 'receipt' || target === undefined) throw new Error('缺少批次');
  const saved = await postReceipt({ batchId: target.batchId, qty: draft.qty, receivedOn: draft.receivedOn, category: target.lane === 'finished' ? 'finished' : 'packaging', ...(draft.fulfillment === undefined ? {} : { fulfillment: draft.fulfillment }) });
  return { kind: 'receipt', id: saved.id, label: '已登记收货', row };
}

async function saveShip(input: SaveInput): Promise<Undo> {
  const { draft, target } = input;
  if (draft.kind !== 'ship' || target === undefined) throw new Error('缺少批次');
  const saved = await postShipment({ batchId: target.batchId, qty: draft.qty, shippedOn: draft.shippedOn, ...(draft.fulfillment === undefined ? {} : { fulfillment: draft.fulfillment }) });
  return { kind: 'ship', id: saved.id, label: '已登记发货' };
}

async function saveDate(input: SaveInput): Promise<Undo> {
  const { draft, target } = input;
  if (draft.kind !== 'date' || target === undefined) throw new Error('缺少批次');
  const body = confirmedDateBody({ hadDate: target.hadDate, date: draft.date, reason: draft.reason });
  await apiSend({ path: `/api/v1/batches/${encodeURIComponent(target.batchId)}`, method: 'PATCH', body, schema: BatchViewSchema });
  return { kind: 'date', batchId: target.batchId, previous: target.confirmedDate, label: '已改确认日' };
}

async function saveNote(input: SaveInput): Promise<Undo> {
  if (input.draft.kind !== 'note') throw new Error('缺少批次');
  const ids = input.target ?? input.note;
  if (ids === undefined) throw new Error('缺少批次');
  const reminder = reminderChangeOf(input.draft.nextFollowUpLocal, input.target?.nextFollowUpAt);
  const saved = await apiSend({ path: '/api/v1/follow-ups', method: 'POST', body: { orderLineId: ids.lineId, batchId: ids.batchId, kind: input.draft.followKind, text: input.draft.text.trim(), ...reminder }, schema: FollowUpViewSchema });
  return { kind: 'note', id: saved.id, label: '已记跟进' };
}

async function saveException(input: SaveInput): Promise<Undo> {
  const { draft, target } = input;
  if (draft.kind !== 'exception' || target === undefined) throw new Error('缺少批次');
  const saved = await apiSend({ path: '/api/v1/exceptions', method: 'POST', body: { orderLineId: target.lineId, batchId: target.batchId, type: draft.type, note: draft.note.trim() }, schema: ExceptionViewSchema });
  return { kind: 'exception', id: saved.id, label: '已标异常' };
}

async function restore(state: ReturnType<typeof useTodayState>): Promise<void> {
  const undo = state.undo;
  if (undo === null) return;
  try {
    if (undo.kind === 'receipt') {
      await apiSend({ path: `/api/v1/receipts/${encodeURIComponent(undo.id)}/void`, method: 'POST', body: { reason: '撤销登记' }, schema: ReceiptViewSchema });
    } else if (undo.kind === 'date') {
      await apiSend({ path: `/api/v1/batches/${encodeURIComponent(undo.batchId)}`, method: 'PATCH', body: { dateBuyerConfirmed: undo.previous, reason: '撤销登记' }, schema: BatchViewSchema });
    } else {
      await apiDelete(deletePath(undo.kind, undo.id));
    }
    state.setUndo(null);
    state.setNotice('已撤销');
    await applyNextToday(state);
  } catch (error) {
    state.setNotice(error instanceof Error ? error.message : '撤销失败');
  }
}

function deletePath(kind: 'ship' | 'note' | 'exception', id: string): string {
  if (kind === 'ship') return `/api/v1/shipments/${encodeURIComponent(id)}`;
  if (kind === 'note') return `/api/v1/follow-ups/${encodeURIComponent(id)}`;
  return `/api/v1/exceptions/${encodeURIComponent(id)}`;
}
