import { isPlanGroupMode, readGroup, type ArrivalsView, type GroupMode, type NoteRef, type OpenForm, type Target } from '../../features/today/index.js';
import { startTransition, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { preserveDetailReturnState } from '../../shared/hooks/detail-return-focus.js';
import { writeUrlState } from '../../shared/hooks/url-state.js';
import { actionPageParams, type WorkspaceView } from './action-query.js';
import { openQuick } from './today-open.js';

export function screenView(params: URLSearchParams): { readonly group: GroupMode; readonly workspaceView: WorkspaceView; readonly arrivalsView: ArrivalsView | undefined } {
  if (params.get('view') === 'arrivals') {
    const timing = params.get('timing');
    return { group: 'waiting', workspaceView: 'list', arrivalsView: { focusBatch: params.get('focusBatch'), ...(timing === 'overdue' || timing === 'due_today' ? { timing } : {}) } };
  }
  const group = readGroup(params.toString());
  const view = params.get('view');
  if (isPlanGroupMode(group)) return { group, workspaceView: 'list', arrivalsView: undefined };
  if (view === 'schedule') return { group: 'schedule', workspaceView: 'list', arrivalsView: undefined };
  return workspaceScreen({ params, group });
}

function workspaceScreen({ params, group }: { readonly params: URLSearchParams; readonly group: GroupMode }) {
  const workspaceView = readWorkspaceView({ params, group });
  const listGroup = group === 'kanban' ? 'priority' : group;
  const actionGroup: GroupMode = workspaceView === 'board' ? 'kanban' : workspaceView === 'calendar' ? 'priority' : listGroup;
  return { group: actionGroup, workspaceView, arrivalsView: undefined };
}

function readWorkspaceView({ params, group }: { readonly params: URLSearchParams; readonly group: GroupMode }): WorkspaceView {
  const view = params.get('view');
  if (view === 'list' || view === 'calendar' || view === 'board') return view;
  const isBoard = group === 'kanban' && (params.has('group') || view === 'actions');
  return isBoard && params.get('sort') !== 'bulk' ? 'board' : 'list';
}

export type TodaySession = {
  readonly drawerId: string | null;
  readonly draftKind: OpenForm['kind'] | null;
};

export type TodaySessionState = {
  readonly drawerId: string | null;
  readonly draft: OpenForm | null;
  readonly targets: Readonly<Record<string, Target>>;
  readonly noteRefs: Readonly<Record<string, NoteRef>>;
  readonly setDrawerId: (id: string | null) => void;
  readonly setDraft: (draft: OpenForm | null) => void;
  readonly setFocus: (id: string | null) => void;
  readonly setSaveError: (message: string) => void;
};

type SearchSetter = ReturnType<typeof useSearchParams>[1];

const DRAFT_KINDS: readonly OpenForm['kind'][] = ['receipt', 'ship', 'date', 'note', 'exception'];

export function draftKindOf(value: string | null): OpenForm['kind'] | null {
  return DRAFT_KINDS.find((kind) => kind === value) ?? null;
}

export function readTodaySession(search: string): TodaySession {
  const params = new URLSearchParams(search);
  return { drawerId: emptyToNull(params.get('drawer')), draftKind: draftKindOf(params.get('draft')) };
}

export function validTodaySession(input: {
  readonly session: TodaySession;
  readonly rows: readonly { readonly id: string }[];
}): TodaySession {
  if (input.session.drawerId === null) return { drawerId: null, draftKind: null };
  if (isTaskDrawerId(input.session.drawerId)) return input.session;
  if (!input.rows.some((row) => row.id === input.session.drawerId)) return { drawerId: null, draftKind: null };
  return input.session;
}

/** 排期任务抽屉由任务 API 自己校验 id，不在今日原因行里。 */
function isTaskDrawerId(drawerId: string): boolean {
  return drawerId.startsWith('task:');
}

export function writeTodaySession(input: { readonly search: string; readonly session: TodaySession }): string {
  const written = writeUrlState(input.search, { drawer: input.session.drawerId, draft: input.session.draftKind });
  return written.startsWith('?') ? written.slice(1) : written;
}

export function useTodaySession(input: {
  readonly state: TodaySessionState;
  readonly rows: readonly { readonly id: string }[];
  readonly isReady: boolean;
  readonly setUnavailableArrivalSearch?: ((search: string | null) => void) | undefined;
}) {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const syncedSearch = useRef<string | null>(null);
  const openingDrawer = useRef<string | null>(null);
  const draftKind = input.state.draft?.kind ?? null;
  const drawerId = input.state.drawerId;
  const hasMissingArrival = missingArrivalDrawer({ search, rows: input.rows, isArrivals: input.setUnavailableArrivalSearch !== undefined });
  useEffect(() => {
    if (readTodaySession(search).drawerId === openingDrawer.current) openingDrawer.current = null;
    if (!input.isReady) return;
    const wanted = writeTodaySession({ search, session: { drawerId, draftKind } });
    if (!hasMissingArrival && wanted === search) {
      syncedSearch.current = search;
      return;
    }
    if (!hasMissingArrival && syncedSearch.current === search) {
      syncedSearch.current = wanted;
      setParams(new URLSearchParams(wanted));
      return;
    }
    const session = validTodaySession({ session: readTodaySession(search), rows: input.rows });
    syncedSearch.current = restore({ session, search, state: input.state, setParams });
    if (hasMissingArrival) input.setUnavailableArrivalSearch?.(syncedSearch.current);
  }, [search, input.isReady, drawerId, draftKind, hasMissingArrival]);

  return {
    isOpening: () => openingDrawer.current !== null,
    close(keepDrawerId: string | null, selection?: URLSearchParams) {
      const previousDrawer = drawerId ?? openingDrawer.current;
      openingDrawer.current = keepDrawerId;
      changeSession({ keepDrawerId, previousDrawer, selection, setParams, state: input.state,
        clearUnavailable: input.setUnavailableArrivalSearch });
    },
  };
}

function changeSession({ keepDrawerId, previousDrawer, selection, setParams, state, clearUnavailable }: {
  readonly keepDrawerId: string | null; readonly previousDrawer: string | null; readonly selection: URLSearchParams | undefined;
  readonly setParams: SearchSetter; readonly state: TodaySessionState; readonly clearUnavailable: ((search: null) => void) | undefined;
}) {
  const session: TodaySession = { drawerId: keepDrawerId, draftKind: null };
  // 路由在过渡中更新。一起提交关闭状态，避免同步逻辑重复写入浏览器历史。
  startTransition(() => {
    clearUnavailable?.(null);
    applySession({ session, state });
    const shouldClearFocus = selection === undefined && (keepDrawerId ?? previousDrawer)?.startsWith('batch:') === true;
    setParams((current) => sessionSearch({ current: selection ?? current, session, shouldClearFocus }));
  });
}

function missingArrivalDrawer({ search, rows, isArrivals }: {
  readonly search: string; readonly rows: readonly { readonly id: string }[]; readonly isArrivals: boolean;
}): boolean {
  if (!isArrivals) return false;
  const { drawerId } = readTodaySession(search);
  return drawerId?.startsWith('batch:') === true && !rows.some(({ id }) => id === drawerId);
}

function sessionSearch({ current, session, shouldClearFocus }: {
  readonly current: URLSearchParams; readonly session: TodaySession; readonly shouldClearFocus: boolean;
}): URLSearchParams {
  const next = new URLSearchParams(current);
  if (shouldClearFocus) {
    next.delete('focusId');
    next.delete('focusBatch');
  }
  return new URLSearchParams(writeTodaySession({ search: next.toString(), session }));
}

function restore(input: {
  readonly session: TodaySession;
  readonly search: string;
  readonly state: TodaySessionState;
  readonly setParams: SearchSetter;
}): string {
  applySession({ session: input.session, state: input.state });
  const cleaned = writeTodaySession({ search: input.search, session: input.session });
  if (cleaned !== input.search) input.setParams(new URLSearchParams(cleaned), { replace: true });
  return cleaned;
}

function applySession(input: { readonly session: TodaySession; readonly state: TodaySessionState }): void {
  const { session, state } = input;
  state.setSaveError('');
  state.setDraft(null);
  if (session.drawerId === null) {
    state.setDrawerId(null);
    return;
  }
  state.setDrawerId(session.drawerId);
  state.setFocus(session.drawerId);
  if (session.draftKind === null) return;
  openQuick({
    id: session.drawerId,
    kind: session.draftKind,
    targets: state.targets,
    noteRefs: state.noteRefs,
    setFocus: state.setFocus,
    setDraft: state.setDraft,
    setDrawerId: state.setDrawerId,
    setSaveError: state.setSaveError,
  });
}

function emptyToNull(value: string | null): string | null {
  return value === null || value === '' ? null : value;
}

export function useAppliedPage({ loadedPage, requested, search, setParams }: {
  readonly loadedPage: number | undefined;
  readonly requested: number;
  readonly search: string;
  readonly setParams: ReturnType<typeof useSearchParams>[1];
}): void {
  const location = useLocation();
  useEffect(() => {
    if (loadedPage === undefined || loadedPage === requested) return;
    setParams(actionPageParams(search, loadedPage), { replace: true, state: preserveDetailReturnState(location) });
  }, [loadedPage, requested, search, setParams, location]);
}

export function pendingReturnId(state: unknown): string | null {
  return typeof state === 'object' && state !== null && 'todayPendingId' in state && typeof state.todayPendingId === 'string'
    ? state.todayPendingId : null;
}

export function arrivalReturnId(state: unknown): string | null {
  return typeof state === 'object' && state !== null && 'todayArrivalId' in state && typeof state.todayArrivalId === 'string'
    ? state.todayArrivalId : null;
}
