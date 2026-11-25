import { shortcutAction, type OpenForm } from '../../features/today/index.js';

type Move = 'down' | 'up';

export type KeyActions = {
  readonly setFocus: (id: string | null) => void;
  readonly toggleHelp: () => void;
  readonly closeDraft: () => void;
  readonly closeDrawer: () => void;
  readonly openDrawer: () => void;
  readonly open: (kind: OpenForm['kind']) => void;
};

type KeyPress = {
  readonly key: string;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
  readonly preventDefault: () => void;
};

export function focusForRows(input: { readonly focus: string | null; readonly rows: readonly { readonly id: string }[]; readonly isSettled: boolean }): string | null {
  if (!input.isSettled || input.focus === null) return input.focus;
  if (input.rows.some((row) => row.id === input.focus)) return input.focus;
  return input.rows[0]?.id ?? null;
}

export function rowsSettled(input: { readonly isReady: boolean; readonly isSchedule: boolean; readonly plan: string }): boolean {
  if (!input.isReady) return false;
  if (!input.isSchedule) return true;
  return input.plan === 'ready' || input.plan === 'error';
}

export function handleKey(input: {
  readonly event: KeyPress;
  readonly rows: readonly { readonly id: string }[];
  readonly focus: string | null;
  readonly hasDraft: boolean;
  readonly isPlanMode?: boolean;
  readonly actions: KeyActions;
}): void {
  if (isTyping(input.event.target) || input.event.defaultPrevented) return;
  if (input.event.key === 'Escape') {
    escape(input);
    return;
  }
  if (isControl(input.event)) return;
  if (input.event.key === 'Enter') {
    if (isCurrentRow(input.rows, input.focus)) input.actions.openDrawer();
    return;
  }
  const arrow = arrowMove(input.event.key);
  if (arrow !== null) {
    input.event.preventDefault();
    input.actions.setFocus(moveFocus({ rows: input.rows, focus: input.focus, action: arrow }));
    return;
  }
  const action = shortcutAction(input.event.key);
  if (input.isPlanMode === true && !isNavigation(action)) return;
  applyShortcut({ action, rows: input.rows, focus: input.focus, actions: input.actions });
}

function isCurrentRow(rows: readonly { readonly id: string }[], focus: string | null): boolean {
  return focus !== null && rows.some((row) => row.id === focus);
}

function isNavigation(action: ReturnType<typeof shortcutAction>): boolean {
  return action === 'down' || action === 'up' || action === 'help';
}

function escape(input: { readonly hasDraft: boolean; readonly actions: KeyActions }): void {
  if (input.hasDraft) input.actions.closeDraft();
  else input.actions.closeDrawer();
}

function arrowMove(key: string): Move | null {
  if (key === 'ArrowDown') return 'down';
  if (key === 'ArrowUp') return 'up';
  return null;
}

function applyShortcut(input: {
  readonly action: ReturnType<typeof shortcutAction>;
  readonly rows: readonly { readonly id: string }[];
  readonly focus: string | null;
  readonly actions: KeyActions;
}): void {
  if (input.action === 'down' || input.action === 'up') {
    input.actions.setFocus(moveFocus({ rows: input.rows, focus: input.focus, action: input.action }));
    return;
  }
  if (input.action === 'help') {
    input.actions.toggleHelp();
    return;
  }
  if (input.action !== null && isCurrentRow(input.rows, input.focus)) input.actions.open(input.action);
}

function moveFocus(input: { readonly rows: readonly { readonly id: string }[]; readonly focus: string | null; readonly action: Move }): string | null {
  const index = input.rows.findIndex((row) => row.id === input.focus);
  const next = input.action === 'down' ? index + 1 : index - 1;
  return input.rows[next]?.id ?? input.rows[0]?.id ?? null;
}

function isTyping(target: EventTarget | null): boolean {
  if (target === null || typeof HTMLInputElement === 'undefined') return false;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function isControl({ target, key }: KeyPress): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  const control = target.closest('button, a[href], [role="button"], [role="tab"], [role="checkbox"], [role="combobox"], [role="option"], [role="menu"], [tabindex="0"]');
  if (control === null) return false;
  return !control.classList.contains('today-task-row') || key === 'Enter' || key === ' ';
}
