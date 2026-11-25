import type { TodayPaging, TodaySort } from '@sw/contracts';
import { filterReasons, groupByWaiting, sortTodos } from './group.js';
import { actionsOf } from './actions.js';
import { actionReasonText, orderCodes } from './codes.js';
import { faceOf } from './face.js';
import { nudgeOf } from './nudge.js';
import { isPlanGroupMode } from './plan-board.js';
import { resolveGroup } from './query.js';
import type { BoardGroup, BoardItem, BoardRow, GroupMode, ReasonChip, ReasonCount, TodayBoard } from './types.js';

const EMPTY_TEXT = '今天没有需要处理的事。下一步：去跟进中心看看。';

export const ACTION_LANES = [
  { key: 'shipment', name: '跟进发货' },
  { key: 'receipt', name: '核对收货' },
  { key: 'internal', name: '内部待办' },
] as const;

export function todayBoard(input: {
  readonly items: readonly BoardItem[];
  readonly reasons: readonly string[];
  readonly group: string | null;
  readonly buyerName: string;
  readonly receiptActionIds?: ReadonlySet<string>;
  readonly page?: Pick<TodayPaging, 'reasonCounts'> & { readonly sort: TodaySort };
}): TodayBoard {
  const group = resolveGroup(input.group);
  const groups = groupsOf({
    items: input.page === undefined ? sortTodos(filterReasons(input.items, input.reasons)) : input.items,
    isPaged: input.page !== undefined,
    isBulk: input.page?.sort.kind === 'bulk',
    group,
    reasons: input.reasons,
    buyerName: input.buyerName,
    receiptActionIds: input.receiptActionIds,
  });
  return { group, chips: chipsOf({ items: input.items, reasons: input.reasons, counts: input.page?.reasonCounts }), body: bodyOf(groups) };
}

function groupsOf(input: {
  readonly items: readonly BoardItem[];
  readonly group: GroupMode;
  readonly isPaged: boolean;
  readonly isBulk: boolean;
  readonly reasons: readonly string[];
  readonly buyerName: string;
  readonly receiptActionIds: ReadonlySet<string> | undefined;
}): BoardGroup[] {
  if (input.items.length === 0 || isPlanGroupMode(input.group)) return [];
  if (input.isBulk) {
    return [decorate({ key: 'bulk', name: '大批优先', items: input.items, buyerName: input.buyerName })];
  }
  if (input.group === 'kanban') return kanbanGroups(input.items, input.receiptActionIds);
  if (input.group === 'priority') {
    return [{ key: 'priority', name: '行动清单', counts: [], nudgeText: '', rows: rowsOf(input.items) }];
  }
  if (input.group === 'waiting') return waitingGroups(input.items, input.buyerName);
  if (input.group === 'reason') return reasonGroups(input);
  return dateGroups(input.items, input.buyerName);
}

function kanbanGroups(items: readonly BoardItem[], receiptActionIds: ReadonlySet<string> | undefined): BoardGroup[] {
  const lanes: Record<typeof ACTION_LANES[number]['key'], BoardItem[]> = { shipment: [], receipt: [], internal: [] };
  for (const item of items) {
    if (receiptActionIds?.has(item.id) === true) lanes.receipt.push(item);
    else if (item.waitingKind === 'supplier' && item.batchStatus !== null) lanes.shipment.push(item);
    else lanes.internal.push(item);
  }
  return ACTION_LANES.map(({ key, name }) => ({ key, name, counts: [], nudgeText: '', rows: rowsOf(lanes[key]) }));
}

function waitingGroups(items: readonly BoardItem[], buyerName: string): BoardGroup[] {
  return groupByWaiting(items).map((group) => decorate({
    key: group.key,
    name: group.name,
    items: group.items,
    buyerName,
  }));
}

function reasonGroups(input: {
  readonly isPaged: boolean;
  readonly items: readonly BoardItem[];
  readonly reasons: readonly string[];
  readonly buyerName: string;
}): BoardGroup[] {
  const present = orderCodes(input.items.flatMap((item) => [...item.reasons]));
  const codes = input.reasons.length === 0 ? present : present.filter((code) => input.reasons.includes(code));
  const assigned = new Set<string>();
  return codes.flatMap((code) => membersOf({
    code, items: input.items.filter((item) => !assigned.has(item.id)), buyerName: input.buyerName,
    assigned: input.isPaged ? assigned : undefined,
  }));
}

function membersOf(input: { readonly code: string; readonly items: readonly BoardItem[]; readonly buyerName: string; readonly assigned: Set<string> | undefined }): BoardGroup[] {
  const members = input.items.filter((item) => item.reasons.includes(input.code));
  if (members.length === 0) return [];
  for (const item of members) input.assigned?.add(item.id);
  return [decorate({ key: input.code, name: actionReasonText(input.code), items: members, buyerName: input.buyerName })];
}

function dateGroups(items: readonly BoardItem[], buyerName: string): BoardGroup[] {
  const buckets = new Map<string, BoardItem[]>();
  const undated: BoardItem[] = [];
  for (const item of items) placeDate({ item, buckets, undated });
  const dated = [...buckets.keys()].sort().flatMap((key) => datedGroup({ key, buckets, buyerName }));
  if (undated.length === 0) return dated;
  return [...dated, decorate({ key: 'none', name: '未定日期', items: undated, buyerName })];
}

function placeDate(input: { readonly item: BoardItem; readonly buckets: Map<string, BoardItem[]>; readonly undated: BoardItem[] }): void {
  if (input.item.dueDate === null) {
    input.undated.push(input.item);
    return;
  }
  const list = input.buckets.get(input.item.dueDate) ?? [];
  list.push(input.item);
  input.buckets.set(input.item.dueDate, list);
}

function datedGroup(input: { readonly key: string; readonly buckets: ReadonlyMap<string, readonly BoardItem[]>; readonly buyerName: string }): BoardGroup[] {
  const members = input.buckets.get(input.key);
  if (members === undefined) return [];
  return [decorate({ key: input.key, name: input.key, items: members, buyerName: input.buyerName })];
}

function decorate(input: { readonly key: string; readonly name: string; readonly items: readonly BoardItem[]; readonly buyerName: string }): BoardGroup {
  return {
    key: input.key,
    name: input.name,
    counts: countsOf(input.items),
    nudgeText: input.key === 'bulk' ? '' : nudgeOf({ items: input.items, buyerName: input.buyerName }),
    rows: rowsOf(input.items),
  };
}

function rowsOf(items: readonly BoardItem[]): BoardRow[] {
  return items.map((item) => ({ id: item.id, face: faceOf(item), actions: actionsOf(item) }));
}

function countsOf(items: readonly BoardItem[]): ReasonCount[] {
  return orderCodes(items.flatMap((item) => [...item.reasons])).flatMap((code) => countEntry(items, code));
}

function countEntry(items: readonly BoardItem[], code: string): ReasonCount[] {
  const count = items.filter((item) => item.reasons.includes(code)).length;
  if (count === 0) return [];
  return [{ label: actionReasonText(code), count }];
}

function chipsOf(input: {
  readonly items: readonly BoardItem[];
  readonly reasons: readonly string[];
  readonly counts: TodayPaging['reasonCounts'] | undefined;
}): ReasonChip[] {
  const present = input.counts === undefined
    ? input.items.flatMap((item) => [...item.reasons])
    : Object.entries(input.counts).flatMap(([code, count]) => count > 0 ? [code] : []);
  const codes = orderCodes([...present, ...input.reasons]);
  const counts: Readonly<Record<string, number>> | undefined = input.counts;
  return codes.map((code) => ({
    code,
    label: actionReasonText(code),
    count: counts === undefined ? input.items.filter((item) => item.reasons.includes(code)).length : (counts[code] ?? 0),
    isSelected: input.reasons.includes(code),
  }));
}

function bodyOf(groups: readonly BoardGroup[]): TodayBoard['body'] {
  if (groups.length === 0) return { kind: 'empty', text: EMPTY_TEXT };
  return { kind: 'groups', groups, rows: flatRows(groups) };
}

function flatRows(groups: readonly BoardGroup[]): BoardRow[] {
  const seen = new Set<string>();
  const rows: BoardRow[] = [];
  for (const group of groups) pushFresh({ group, seen, rows });
  return rows;
}

function pushFresh(input: { readonly group: BoardGroup; readonly seen: Set<string>; readonly rows: BoardRow[] }): void {
  for (const row of input.group.rows) {
    if (input.seen.has(row.id)) continue;
    input.seen.add(row.id);
    input.rows.push(row);
  }
}
