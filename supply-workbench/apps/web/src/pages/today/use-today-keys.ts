import { useEffect, useEffectEvent, type Dispatch, type SetStateAction } from 'react';
import type { OpenForm } from '../../features/today/index.js';
import { focusWorkspaceRow, workspaceKeyboardRows, workspaceRowId, workspaceRowOf } from './today-focus.js';
import { handleKey, type KeyActions } from './today-keys.js';
import { openQuick } from './today-open.js';
import type { TodaySessionState } from './today-session.js';

type KeyboardState = TodaySessionState & {
  readonly focus: string | null;
  readonly isHelpOpen: boolean;
  readonly setHelp: Dispatch<SetStateAction<boolean>>;
};

type KeyboardScope = {
  readonly state: KeyboardState;
  readonly isSettled: boolean;
  readonly isPlanMode: boolean;
  readonly isArrivalsView: boolean;
  readonly closeSession: (drawerId: string | null) => void;
  readonly canRecord: boolean;
};

export function useTodayKeys(scope: KeyboardScope): void {
  const routeKey = useEffectEvent((event: KeyboardEvent) => {
    const { state, isSettled, isPlanMode } = scope;
    const targetRow = workspaceRowOf(event.target) ?? state.focus;
    handleKey({
      event,
      rows: isSettled || isPlanMode ? workspaceKeyboardRows() : [],
      focus: targetRow,
      hasDraft: state.draft !== null,
      hasDrawer: state.drawerId !== null,
      isHelpOpen: state.isHelpOpen,
      isPlanMode,
      actions: keyboardActions(scope, targetRow),
    });
  });
  const followFocus = useEffectEvent((event: FocusEvent) => {
    const id = workspaceRowOf(event.target);
    const { state } = scope;
    if (id !== null && state.drawerId === null && !state.isHelpOpen) state.setFocus(id);
  });
  const followClick = useEffectEvent(({ target }: MouseEvent) => selectClickedRow(scope, target));
  useEffect(() => {
    if (scope.isArrivalsView) return;
    const onKey = (event: KeyboardEvent) => routeKey(event);
    const onFocus = (event: FocusEvent) => followFocus(event);
    const onClick = (event: MouseEvent) => followClick(event);
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('click', onClick);
    };
  }, [scope.isArrivalsView]);
}

function selectClickedRow({ state, isSettled, isPlanMode }: KeyboardScope, target: EventTarget | null): void {
  if (!isSettled || isPlanMode || state.drawerId !== null || state.isHelpOpen || !(target instanceof Element)) return;
  if (target.closest('.today-work-card') === null) return;
  const id = workspaceRowOf(target);
  if (id === null) return;
  state.setFocus(id);
  if (target.closest('button, a[href]') === null) document.getElementById(workspaceRowId(id))?.focus({ preventScroll: true });
}

function keyboardActions({ state, closeSession, canRecord }: KeyboardScope, targetRow: string | null): KeyActions {
  return {
    setFocus: (id) => {
      state.setFocus(id);
      if (id !== null) focusWorkspaceRow(id);
    },
    toggleHelp: () => state.setHelp((value) => !value),
    closeDraft: () => closeSession(state.drawerId),
    closeDrawer: () => closeSession(null),
    openDrawer: () => { if (targetRow !== null) openFocusedDrawer(targetRow, state); },
    open: (kind) => { if (canRecord && targetRow !== null) recordFocusedRow({ kind, id: targetRow, state }); },
  };
}

function openFocusedDrawer(id: string, state: KeyboardState): void {
  const row = focusWorkspaceRow(id);
  if (row?.matches('button, a[href]') === true) {
    row.click();
    return;
  }
  state.setFocus(id);
  state.setDrawerId(id);
  state.setDraft(null);
}

function recordFocusedRow({ kind, id, state }: { readonly kind: OpenForm['kind']; readonly id: string; readonly state: KeyboardState }): void {
  if (state.targets[id] === undefined && (kind !== 'note' || state.noteRefs[id] === undefined)) return;
  focusWorkspaceRow(id);
  openQuick({ ...state, id, kind });
}
