import type { DailyPlan, WorkItem } from './task.js';
import { isUnassigned, isUrgent, overdueText, taskMeta, taskParam, taskTags, type TaskTag } from './task.js';

export type PlanGroupMode = 'schedule' | 'owner' | 'supplier';

export type PlanRow = {
  readonly id: string;
  readonly workItemId: string;
  readonly title: string;
  readonly meta: string;
  readonly tags: readonly TaskTag[];
};

export type PlanCount = {
  readonly label: string;
  readonly count: number;
};

export type PlanBoardGroup = {
  readonly key: string;
  readonly name: string;
  readonly counts: readonly PlanCount[];
  readonly note: string | null;
  readonly isUnassigned: boolean;
  readonly rows: readonly PlanRow[];
};

export type PlanBoard =
  | { readonly kind: 'groups'; readonly groups: readonly PlanBoardGroup[]; readonly rows: readonly PlanRow[] }
  | { readonly kind: 'empty'; readonly text: string };

export type PlanInsight = {
  readonly total: number;
  readonly urgent: number;
  readonly overdue: number;
  readonly unassigned: number;
};

export type PlanLoad =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly view: DailyPlan; readonly board: PlanBoard }
  | { readonly kind: 'error'; readonly message: string };

export type ViewGroup = DailyPlan['byOwner'][number];

export const PLAN_EMPTY_TEXT = '今天没有到期的排期任务。下一步：导入排期里程碑。';

const PRIORITY_RANK: Readonly<Record<WorkItem['priority'], number>> = { low: 0, normal: 1, high: 2, urgent: 3 };

export function isPlanGroupMode(group: string | null): group is PlanGroupMode {
  return group === 'schedule' || group === 'owner' || group === 'supplier';
}

export function planInsight(view: DailyPlan): PlanInsight {
  return {
    total: view.total,
    urgent: view.items.filter(isUrgent).length,
    overdue: view.overdueCount,
    unassigned: view.items.filter(isUnassigned).length,
  };
}

export function planBoard(input: { readonly view: DailyPlan; readonly group: PlanGroupMode }): PlanBoard {
  const groups = input.group === 'schedule'
    ? scheduleGroups(input.view)
    : groupedRows({ groups: input.group === 'owner' ? input.view.byOwner : input.view.bySupplier, today: input.view.date, mode: input.group });
  return boardOf(groups);
}

export function sortPlanItems(items: readonly WorkItem[]): readonly WorkItem[] {
  return [...items].sort((left, right) => {
    const priority = PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
    if (priority !== 0) return priority;
    const overdue = (right.overdueDays ?? -1) - (left.overdueDays ?? -1);
    if (overdue !== 0) return overdue;
    return compareText(left.plannedEnd, right.plannedEnd) || compareText(left.id, right.id);
  });
}

export function planRows(items: readonly WorkItem[], today: string): readonly PlanRow[] {
  return sortPlanItems(items).map((item) => ({
    id: taskParam(item.id),
    workItemId: item.id,
    title: item.title,
    meta: taskMeta(item, today),
    tags: taskTags(item, today),
  }));
}

function scheduleGroups(view: DailyPlan): readonly PlanBoardGroup[] {
  const dueToday = view.items.filter((item) => item.overdueDays === null);
  const overdue = view.items.filter((item) => item.overdueDays !== null);
  return [dueGroup(dueToday, view.date), overdueGroup(overdue, view.date)].flatMap((group) => (group === null ? [] : [group]));
}

function dueGroup(items: readonly WorkItem[], today: string): PlanBoardGroup | null {
  if (items.length === 0) return null;
  return {
    key: 'due-today',
    name: '今天到期',
    counts: [{ label: '任务', count: items.length }, { label: '高优先', count: items.filter(isUrgent).length }],
    note: null,
    isUnassigned: false,
    rows: planRows(items, today),
  };
}

function overdueGroup(items: readonly WorkItem[], today: string): PlanBoardGroup | null {
  if (items.length === 0) return null;
  return {
    key: 'overdue',
    name: '逾期',
    counts: [{ label: '任务', count: items.length }],
    note: `平均逾期 ${averageOverdue(items)} 天`,
    isUnassigned: false,
    rows: planRows(items, today),
  };
}

function averageOverdue(items: readonly WorkItem[]): number {
  const days = items.flatMap((item) => (item.overdueDays === null ? [] : [item.overdueDays]));
  if (days.length === 0) return 0;
  return Math.round(days.reduce((total, value) => total + value, 0) / days.length);
}

function groupedRows(input: { readonly groups: readonly ViewGroup[]; readonly today: string; readonly mode: 'owner' | 'supplier' }): readonly PlanBoardGroup[] {
  return input.groups.map((group) => ({
    key: group.key,
    name: group.label ?? unnamed(input.mode),
    counts: groupedCounts(group.items, input.mode),
    note: group.key === 'unassigned' ? unassignedNote(input.mode) : null,
    isUnassigned: input.mode === 'owner' && group.key === 'unassigned',
    rows: planRows(group.items, input.today),
  }));
}

function groupedCounts(items: readonly WorkItem[], mode: 'owner' | 'supplier'): readonly PlanCount[] {
  const overdue = items.filter((item) => overdueText(item) !== null).length;
  const blocked = items.filter((item) => item.status === 'blocked').length;
  return [
    { label: mode === 'owner' ? '任务' : '未完成', count: items.length },
    { label: '逾期', count: overdue },
    { label: '阻塞', count: blocked },
  ];
}

function unnamed(mode: 'owner' | 'supplier'): string {
  return mode === 'owner' ? '未分配' : '未指定供应商';
}

function unassignedNote(mode: 'owner' | 'supplier'): string {
  return mode === 'owner' ? '需指派' : '需补供应商';
}

function boardOf(groups: readonly PlanBoardGroup[]): PlanBoard {
  if (groups.length === 0) return { kind: 'empty', text: PLAN_EMPTY_TEXT };
  return { kind: 'groups', groups, rows: groups.flatMap((group) => group.rows) };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
