import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { TodayPageResponse, TodayResponse, TodoItemView } from '@sw/contracts';
import { isOpenBatch } from '@sw/domain';
import { fetchTodayPage } from '../../shared/api/catalog.js';
import { failureText, read, readFailureOf } from '../../shared/api/reads.js';
import { toBoardItem, type ActionDetail, type BoardItem, type NoteRef, type Target } from '../../features/today/index.js';
import { actionPageSearch, actionQuery, type ActionQuery } from './action-query.js';

export type TodayLoad = {
  readonly asOf: TodayPageResponse['asOf'];
  readonly items: readonly BoardItem[];
  readonly targets: Readonly<Record<string, Target>>;
  readonly noteRefs: Readonly<Record<string, NoteRef>>;
  readonly details: Readonly<Record<string, ActionDetail>>;
  readonly buyerName: string;
  readonly buyerId: string | null;
  readonly arrivalMemos: TodayResponse['arrivalMemos'];
  readonly counts: TodayPageResponse['counts'];
  readonly paging: TodayPageResponse['paging'];
  readonly pendingBatch: NonNullable<TodayResponse['pendingBatch']>;
};

type PageRequest = { readonly path: string; readonly focusId: string | null };
type LoadedPage = PageRequest & { readonly value: TodayLoad };
type LoadState =
  | { readonly phase: 'loading' | 'ready'; readonly path: string }
  | { readonly phase: 'error'; readonly path: string; readonly error: string };

export function useTodayData(query: ActionQuery) {
  const path = actionPageSearch(query);
  const { focusId } = query;
  const { run, loaded, state } = usePageRequest({ path, focusId });
  const isLoadedForQuery = state.phase === 'ready' && hasCurrentPage(loaded, { path, focusId });
  const loadIfNeeded = useEffectEvent(() => {
    if (!isLoadedForQuery) void run(true).catch(() => undefined);
  });
  useEffect(() => { loadIfNeeded(); }, [path, focusId]);
  const refreshScheduled = useEffectEvent(() => {
    if (focusId === null && document.visibilityState === 'visible' && (loaded?.value.paging.followUpCounts?.scheduled ?? 0) > 0) {
      void run(false).catch(() => undefined);
    }
  });
  useEffect(() => {
    const onVisibility = () => refreshScheduled();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return {
    data: loaded?.value ?? null,
    isLoading: state.path !== path || state.phase === 'loading' || (state.phase === 'ready' && !isLoadedForQuery),
    isLoadedForQuery,
    loadError: state.path === path && state.phase === 'error' ? state.error : '',
    refresh: () => run(false),
    retry: () => { void run(true).catch(() => undefined); },
  };
}

function hasCurrentPage(loaded: LoadedPage | null, request: PageRequest): boolean {
  if (loaded === null || loaded.path !== request.path) return false;
  return request.focusId === null || loaded.focusId === request.focusId || loaded.value.items.some((item) => item.id === request.focusId);
}

function usePageRequest(request: PageRequest) {
  const [loaded, setLoaded] = useState<LoadedPage | null>(null);
  const [state, setState] = useState<LoadState>({ phase: 'loading', path: request.path });
  const latest = useRef(request);
  const active = useRef<AbortController | null>(null);
  useLayoutEffect(() => { latest.current = request; }, [request]);
  useEffect(() => () => active.current?.abort(), []);
  const run = useCallback(async (shouldLocate: boolean) => {
    const current = latest.current;
    active.current?.abort();
    const pending = new AbortController();
    active.current = pending;
    setState({ phase: 'loading', path: current.path });
    const params = new URLSearchParams(current.path);
    if (shouldLocate && current.focusId !== null) params.set('focusId', current.focusId);
    const isStale = () => pending.signal.aborted || latest.current.path !== current.path || latest.current.focusId !== current.focusId;
    try {
      const value = await loadToday(params.toString(), pending.signal);
      if (isStale()) return false;
      setLoaded({ ...current, value });
      setState({ phase: 'ready', path: current.path });
      return true;
    } catch (error) {
      if (isStale()) return false;
      setState({ phase: 'error', path: current.path, error: todayLoadError(error) });
      throw error;
    }
  }, []);
  return { run, loaded, state };
}

export async function applyNextToday(input: {
  readonly refresh: () => Promise<boolean>;
  readonly close?: () => void;
  readonly setNotice: (notice: string) => void;
}): Promise<boolean> {
  input.close?.();
  try {
    return await input.refresh();
  } catch (error) {
    input.setNotice(todayLoadError(error));
    return false;
  }
}

function todayLoadError(error: unknown): string {
  const failure = readFailureOf(error);
  return failure === null ? '加载失败' : failureText(failure);
}

export async function loadToday(query = actionPageSearch(actionQuery('')), signal?: AbortSignal): Promise<TodayLoad> {
  const [today, buyer] = await Promise.all([
    fetchTodayPage(query, signal),
    read({ name: 'me', ...(signal === undefined ? {} : { signal }) }).catch(() => null),
  ]);
  return {
    asOf: today.asOf,
    ...collect(today.items), pendingBatch: today.pendingBatch ?? [], arrivalMemos: today.arrivalMemos,
    counts: today.counts, paging: today.paging, buyerName: buyer?.name ?? '', buyerId: buyer?.id ?? null,
  };
}

function collect(items: readonly TodoItemView[]): Pick<TodayLoad, 'items' | 'targets' | 'noteRefs' | 'details'> {
  const targets: Record<string, Target> = {};
  const noteRefs: Record<string, NoteRef> = {};
  const rows = items.map((item) => remember({ item, targets, noteRefs }));
  return { items: rows, targets, noteRefs, details: collectDetails(items) };
}

function collectDetails(items: readonly TodoItemView[]): Record<string, ActionDetail> {
  const details: Record<string, ActionDetail> = {};
  for (const item of items) {
    const detail = actionDetail(item);
    if (detail !== undefined) details[item.id] = detail;
  }
  return details;
}

function actionDetail(item: TodoItemView): ActionDetail | undefined {
  if (item.subject === 'review') return { kind: 'review' };
  if (item.refs.importBatchId !== undefined) return { kind: 'import', batchId: item.refs.importBatchId };
  const lineId = item.line?.id ?? item.refs.orderLineId;
  if (lineId === undefined) return undefined;
  const batchId = item.batch?.id ?? item.refs.batchId;
  return { kind: 'order', order: { lineId, ...(batchId === undefined ? {} : { batchId }) }, exception: item.exception };
}

function remember(input: { readonly item: TodoItemView; readonly targets: Record<string, Target>; readonly noteRefs: Record<string, NoteRef> }): BoardItem {
  const row = toBoardItem(input.item);
  const target = targetOf(input.item);
  const note = noteRefOf(input.item);
  if (target !== undefined) input.targets[row.id] = target;
  if (note !== undefined) input.noteRefs[row.id] = note;
  return row;
}

function targetOf(item: TodoItemView): Target | undefined {
  if (item.batch === null || item.line === null) return undefined;
  return {
    batchId: item.batch.id,
    batchSeq: item.batch.seq,
    lineId: item.line.id,
    plannedQty: item.batch.plannedQty,
    receivedQty: item.batch.receivedQty === null ? 0 : item.batch.receivedQty,
    shippedQty: item.batch.shippedQty === null ? 0 : item.batch.shippedQty,
    lane: item.line.lane,
    hadDate: item.batch.firstConfirmedDate !== null,
    confirmedDate: item.batch.dateBuyerConfirmed,
    canScheduleFollowUp: item.subject === 'batch' && item.ownerUserId !== null && isOpenBatch(item.batch.status),
    ...(item.batch.nextFollowUpAt === undefined ? {} : { nextFollowUpAt: item.batch.nextFollowUpAt }),
    ...(item.batch.fulfillment === undefined ? {} : { fulfillment: item.batch.fulfillment }),
  };
}

function noteRefOf(item: TodoItemView): NoteRef | undefined {
  if (item.line === null || item.batch === null) return undefined;
  const lineId = item.refs.orderLineId;
  const batchId = item.refs.batchId;
  if (lineId === undefined || batchId === undefined) return undefined;
  return { lineId, batchId };
}
