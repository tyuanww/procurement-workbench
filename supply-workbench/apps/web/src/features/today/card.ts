import type { TodoItemView } from '@sw/contracts';
import type { BoardItem } from './model/types.js';

export function toBoardItem(item: TodoItemView): BoardItem {
  return {
    id: item.id,
    severity: item.severity,
    overdueDays: item.overdueDays,
    dueDate: item.dueDate,
    lineId: item.refs.orderLineId ?? item.id,
    waitingName: waitingName(item),
    waitingKey: `${item.waitingOn.kind}:${resolvedPartyId(item)}`,
    waitingKind: item.waitingOn.kind,
    reasons: item.reasons,
    poRaw: item.line?.poRaw ?? null,
    productName: displayName(item),
    ...(item.ownerUserId === null && item.subject !== 'review' ? { isUnassigned: true } : {}),
    batchStatus: item.batch?.status ?? null,
    ...fulfillmentOf(item),
    ...replyOf(item.batch),
    ...(item.reminderTarget === undefined ? {} : { nextFollowUpTarget: reminderLabel(item.reminderTarget) }),
  };
}

function reminderLabel(target: NonNullable<TodoItemView['reminderTarget']>): string {
  if (target.kind === 'internal') return '内部跟进';
  const name = target.name?.trim();
  const action = target.kind === 'supplier' ? '催货' : '核对收货';
  return `${action} · ${name || waitingLabels[target.kind]}`;
}

function displayName(item: TodoItemView): string | null {
  if (item.subject === 'review') return '主数据审核';
  if (item.subject === 'import') return '待确认导入批次';
  return item.line?.nameRaw ?? null;
}

function fulfillmentOf(item: TodoItemView): Pick<BoardItem, 'qty' | 'remaining' | 'inTransit'> {
  const fulfillment = item.batch?.fulfillment;
  if (fulfillment === undefined) return { qty: item.batch?.plannedQty ?? null };
  const { unshippedQty, inTransitQty, unit } = fulfillment;
  return {
    qty: unshippedQty,
    ...(shouldShowRemaining({ reasons: item.reasons, unshippedQty }) ? { remaining: fulfillment } : {}),
    ...(inTransitQty !== null && inTransitQty > 0 && unit !== null ? { inTransit: { qty: inTransitQty, unit } } : {}),
  };
}

function shouldShowRemaining({ reasons, unshippedQty }: { readonly reasons: TodoItemView['reasons']; readonly unshippedQty: number | null }): boolean {
  if (reasons.includes('unshipped')) return true;
  return unshippedQty !== null && unshippedQty > 0 && (reasons.includes('shipped_not_received') || reasons.includes('follow_up_scheduled'));
}

function replyOf(batch: TodoItemView['batch']): Pick<BoardItem, 'latestFollowUp' | 'latestPromise' | 'nextFollowUpAt'> {
  const latest = batch?.latestFollowUp;
  const promise = batch?.latestPromise;
  return {
    ...(latest === undefined ? {} : { latestFollowUp: latest.text }),
    ...(promise === undefined ? {} : { latestPromise: promise.text }),
    ...(batch?.nextFollowUpAt === undefined ? {} : { nextFollowUpAt: batch.nextFollowUpAt }),
  };
}

function resolvedPartyId(item: TodoItemView): string {
  const name = item.waitingOnParty?.displayName?.trim();
  return name == null || name === '' ? '' : (item.waitingOn.partyId ?? '');
}

function waitingName(item: TodoItemView): string {
  const party = item.waitingOnParty;
  const display = party?.displayName?.trim() ?? '';
  if (display !== '') return display;
  const raw = party?.rawName?.trim() ?? '';
  if (raw !== '') return raw;
  return waitingLabels[item.waitingOn.kind];
}

const waitingLabels = { supplier: '工厂未分组', internal: '内部', receiver: '未指定收货方' };
