import { shortcutAction, type OpenForm } from '../../features/today/index.js';
import { workspaceRowId, workspaceRowOf } from './today-focus.js';

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
  readonly isComposing?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
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

type KeyContext = {
  readonly event: KeyPress;
  readonly rows: readonly { readonly id: string }[];
  readonly focus: string | null;
  readonly hasDraft: boolean;
  readonly hasDrawer?: boolean;
  readonly isHelpOpen?: boolean;
  readonly isPlanMode?: boolean;
  readonly actions: KeyActions;
};

export function handleKey(input: KeyContext): void {
  const { event, actions } = input;
  if (omitModifiedKey(event)) return;
  if (event.key === 'Escape') {
    escape(input);
    return;
  }
  if (insideRecord(input)) return;
  if (event.key === '?') {
    if (input.isHelpOpen === true || !inDialog(event.target)) actions.toggleHelp();
    return;
  }
  if (input.isHelpOpen === true || inDialog(event.target) || isControl(event)) return;
  handleRowKey(input);
}

function omitModifiedKey(event: KeyPress): boolean {
  return event.defaultPrevented || event.isComposing === true || event.altKey === true || event.ctrlKey === true || event.metaKey === true;
}

function insideRecord(input: KeyContext): boolean {
  return input.hasDrawer === true || input.hasDraft || isTyping(input.event.target);
}

function handleRowKey({ event, rows, focus, isPlanMode, actions }: KeyContext): void {
  if (event.key === 'Enter') {
    if (isCurrentRow(rows, focus)) {
      event.preventDefault();
      actions.openDrawer();
    }
    return;
  }
  const arrow = arrowMove(event.key);
  const action = shortcutAction(event.key);
  const move = arrow ?? navigationAction(action);
  if (move !== null) {
    const next = moveFocus({ rows, focus, action: move, canWrap: arrow === null });
    if (next !== null) {
      event.preventDefault();
      actions.setFocus(next);
    }
    return;
  }
  if (isPlanMode !== true && isRecordAction(action) && isCurrentRow(rows, focus)) actions.open(action);
}

function navigationAction(action: ReturnType<typeof shortcutAction>): Move | null {
  return action === 'down' || action === 'up' ? action : null;
}

function isCurrentRow(rows: readonly { readonly id: string }[], focus: string | null): boolean {
  return focus !== null && rows.some((row) => row.id === focus);
}

function escape(input: KeyContext): void {
  const { event, actions } = input;
  if (closest(event.target, '[role="combobox"][aria-expanded="true"]') !== null) return;
  if (input.hasDraft) actions.closeDraft();
  else if (input.hasDrawer === true) actions.closeDrawer();
  else if (input.isHelpOpen === true) actions.toggleHelp();
  else return;
  event.preventDefault();
}

function arrowMove(key: string): Move | null {
  if (key === 'ArrowDown') return 'down';
  if (key === 'ArrowUp') return 'up';
  return null;
}

function moveFocus(input: { readonly rows: readonly { readonly id: string }[]; readonly focus: string | null; readonly action: Move; readonly canWrap: boolean }): string | null {
  const { rows, focus, action, canWrap } = input;
  const index = rows.findIndex((row) => row.id === focus);
  if (index < 0) return rows[0]?.id ?? null;
  const next = index + (action === 'down' ? 1 : -1);
  const candidate = canWrap ? (next + rows.length) % rows.length : next;
  return rows[candidate]?.id ?? null;
}

function isRecordAction(action: ReturnType<typeof shortcutAction>): action is OpenForm['kind'] {
  return action === 'date' || action === 'ship' || action === 'receipt' || action === 'note' || action === 'exception';
}

function isTyping(target: EventTarget | null): boolean {
  return closest(target, 'input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

function inDialog(target: EventTarget | null): boolean {
  return closest(target, '[role="dialog"]') !== null;
}

function isControl({ target, key }: KeyPress): boolean {
  const control = closest(target, 'button, a[href], [role="button"], [role="tab"], [role="checkbox"], [role="combobox"], [role="option"], [role="menu"], [tabindex="0"], .today-calendar');
  if (control === null) return false;
  const rowId = workspaceRowOf(control);
  const isRowControl = control === target && rowId !== null && control.id === workspaceRowId(rowId);
  return !isRowControl || key === 'Enter' || key === ' ';
}

function closest(target: EventTarget | null, selector: string): Element | null {
  return typeof Element !== 'undefined' && target instanceof Element ? target.closest(selector) : null;
}
