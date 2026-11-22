import type { TodoItemView } from '@sw/contracts';
import type { BoardItem } from '../../features/today/index.js';

export function toBoardItem(item: TodoItemView): BoardItem {
  return {
    id: item.id,
    severity: item.severity,
    overdueDays: item.overdueDays,
    dueDate: item.dueDate,
    lineId: item.refs.orderLineId ?? item.id,
    waitingName: waitingName(item),
    waitingKey: `${item.waitingOn.kind}:${resolvedPartyId(item)}`,
    reasons: item.reasons,
    poRaw: item.line?.poRaw ?? null,
    productName: item.line?.nameRaw ?? null,
    batchStatus: item.batch?.status ?? null,
    ...fulfillmentOf(item),
    ...replyOf(item.batch),
  };
}

function fulfillmentOf(item: TodoItemView): Pick<BoardItem, 'qty' | 'remaining'> {
  const fulfillment = item.batch?.fulfillment;
  return {
    qty: fulfillment === undefined ? (item.batch?.plannedQty ?? null) : fulfillment.unshippedQty,
    ...(fulfillment !== undefined && item.reasons.includes('unshipped') ? { remaining: fulfillment } : {}),
  };
}

function replyOf(batch: TodoItemView['batch']): Pick<BoardItem, 'latestFollowUp' | 'latestPromise'> {
  const latest = batch?.latestFollowUp;
  const promise = batch?.latestPromise;
  return {
    ...(latest === undefined ? {} : { latestFollowUp: latest.text }),
    ...(promise === undefined ? {} : { latestPromise: promise.text }),
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
