import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { writeUrlState } from '../../shared/hooks/url-state.js';
import { actionPageParams } from './action-query.js';
import { openQuick } from './today-open.js';
import type { NoteRef, OpenForm, Target } from './TodayForms.js';

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

type Synced = {
  readonly search: string;
  readonly drawerId: string | null;
  readonly draftKind: OpenForm['kind'] | null;
};

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
}): void {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const last = useRef<Synced | null>(null);
  const draftKind = input.state.draft?.kind ?? null;
  const drawerId = input.state.drawerId;
  useEffect(() => {
    if (!input.isReady) return;
    const previous = last.current;
    const wanted = writeTodaySession({ search, session: { drawerId, draftKind } });
    if (wanted === search) {
      last.current = { search, drawerId, draftKind };
      return;
    }
    if (previous !== null && previous.search === search) {
      last.current = { search: wanted, drawerId, draftKind };
      setParams(new URLSearchParams(wanted));
      return;
    }
    const session = validTodaySession({ session: readTodaySession(search), rows: input.rows });
    last.current = { search: writeTodaySession({ search, session }), drawerId: session.drawerId, draftKind: session.draftKind };
    restore({ session, search, state: input.state, setParams });
  }, [search, input.isReady, drawerId, draftKind]);
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
