import type { BatchStatus } from '@sw/domain';
import type { BoardItem, QuickAction } from './types.js';

const SHIP: readonly QuickAction[] = [
  { kind: 'ship', label: '登记发货' },
  { kind: 'date', label: '改确认日' },
  { kind: 'note', label: '记跟进' },
];
const REGISTER_RECEIPT: QuickAction = { kind: 'receipt', label: '登记收货' };
const RECEIPT: readonly QuickAction[] = [
  REGISTER_RECEIPT,
  { kind: 'date', label: '改确认日' },
  { kind: 'note', label: '记跟进' },
];
const DATE: readonly QuickAction[] = [
  { kind: 'date', label: '改确认日' },
  { kind: 'note', label: '记跟进' },
];
const NOTE: QuickAction = { kind: 'note', label: '记跟进' };

const BY_STATUS: Record<BatchStatus, readonly QuickAction[]> = {
  awaiting_date: DATE,
  confirmed: SHIP,
  shipped: RECEIPT,
  partially_received: RECEIPT,
  received: DATE,
  closed: [],
  cancelled: [],
};

const BY_REASON: readonly { readonly reason: string; readonly actions: readonly QuickAction[] }[] = [
  { reason: 'missing_date', actions: DATE },
  { reason: 'shipped_not_received', actions: RECEIPT },
  { reason: 'overdue', actions: SHIP },
  { reason: 'due_today', actions: SHIP },
  { reason: 'upcoming', actions: SHIP },
  { reason: 'demand_before_confirmed', actions: SHIP },
  { reason: 'note_missing', actions: [NOTE] },
];

export function actionsOf(item: BoardItem): readonly QuickAction[] {
  if (item.remaining !== undefined) {
    if (item.reasons.includes('missing_date')) return DATE;
    return item.reasons.includes('shipped_not_received') && item.inTransit !== undefined ? [...SHIP, REGISTER_RECEIPT] : SHIP;
  }
  if (item.reasons.includes('fulfillment_review')) return [NOTE];
  if (item.batchStatus === null) return reasonActions(item.reasons);
  const actions = listed(item.batchStatus);
  if (item.waitingKind === 'internal' && item.reasons.includes('note_missing')) {
    return [NOTE, ...actions.filter((action) => action.kind !== 'note')];
  }
  return cap(withNote({ actions, reasons: item.reasons }));
}

function listed(status: BatchStatus): readonly QuickAction[] {
  const actions = BY_STATUS[status];
  if (actions === undefined) return [];
  return actions;
}

function reasonActions(reasons: readonly string[]): readonly QuickAction[] {
  const hit = BY_REASON.find((rule) => reasons.includes(rule.reason));
  if (hit === undefined) return [];
  return hit.actions;
}

function withNote(input: { readonly actions: readonly QuickAction[]; readonly reasons: readonly string[] }): readonly QuickAction[] {
  if (!input.reasons.includes('note_missing')) return input.actions;
  if (input.actions.some((action) => action.kind === 'note')) return input.actions;
  return [...input.actions, NOTE];
}

function cap(actions: readonly QuickAction[]): readonly QuickAction[] {
  return actions.slice(0, 3);
}
