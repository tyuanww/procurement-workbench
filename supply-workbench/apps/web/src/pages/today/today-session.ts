import { readGroup, type GroupMode, type NoteRef, type OpenForm, type Target } from '../../features/today/index.js';
import type { TodayScreenProps } from './TodayBoard.js';
import { startTransition, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { writeUrlState } from '../../shared/hooks/url-state.js';
import { actionPageParams } from './action-query.js';
import { openQuick } from './today-open.js';

export function screenView(params: URLSearchParams): { readonly group: GroupMode; readonly arrivalsView: TodayScreenProps['arrivalsView'] } {
  if (params.get('view') === 'arrivals') {
    const timing = params.get('timing');
    return { group: 'waiting', arrivalsView: { focusBatch: params.get('focusBatch'), ...(timing === 'overdue' || timing === 'due_today' ? { timing } : {}) } };
  }
  return { group: readGroup(params.toString()), arrivalsView: undefined };
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
}): (keepDrawerId: string | null) => void {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const syncedSearch = useRef<string | null>(null);
  const draftKind = input.state.draft?.kind ?? null;
  const drawerId = input.state.drawerId;
  useEffect(() => {
    if (!input.isReady) return;
    const wanted = writeTodaySession({ search, session: { drawerId, draftKind } });
    if (wanted === search) {
      syncedSearch.current = search;
      return;
    }
    if (syncedSearch.current === search) {
      syncedSearch.current = wanted;
      setParams(new URLSearchParams(wanted));
      return;
    }
    const session = validTodaySession({ session: readTodaySession(search), rows: input.rows });
    syncedSearch.current = writeTodaySession({ search, session });
    restore({ session, search, state: input.state, setParams });
  }, [search, input.isReady, drawerId, draftKind]);

  return (keepDrawerId) => {
    const session: TodaySession = { drawerId: keepDrawerId, draftKind: null };
    // 路由在过渡中更新。一起提交关闭状态，避免同步逻辑重复写入浏览器历史。
    startTransition(() => {
      applySession({ session, state: input.state });
      setParams((current) => new URLSearchParams(writeTodaySession({ search: current.toString(), session })));
    });
  };
}

function restore(input: {
  readonly session: TodaySession;
  readonly search: string;
  readonly state: TodaySessionState;
  readonly setParams: SearchSetter;
}): void {
  applySession({ session: input.session, state: input.state });
  const cleaned = writeTodaySession({ search: input.search, session: input.session });
  if (cleaned !== input.search) input.setParams(new URLSearchParams(cleaned), { replace: true });
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
  useEffect(() => {
    if (loadedPage === undefined || loadedPage === requested) return;
    setParams(actionPageParams(search, loadedPage), { replace: true });
  }, [loadedPage, requested, search, setParams]);
}

export function pendingReturnId(state: unknown): string | null {
  return typeof state === 'object' && state !== null && 'todayPendingId' in state && typeof state.todayPendingId === 'string'
    ? state.todayPendingId : null;
}

export function arrivalReturnId(state: unknown): string | null {
  return typeof state === 'object' && state !== null && 'todayArrivalId' in state && typeof state.todayArrivalId === 'string'
    ? state.todayArrivalId : null;
}
