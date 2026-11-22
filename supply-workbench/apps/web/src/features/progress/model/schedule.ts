import type { WorkItemPredecessor } from '@sw/contracts';
import { addDays, diffDays, parseLocalDate, weekStart, type LocalDate } from '@sw/domain';
import type { ScheduleFilters, ScheduleScale } from './schedule-query.js';
import {
  overdueText,
  ownerText,
  plannedRangeText,
  shortDate,
  supplierText,
  factoryText,
  taskParam,
  workItemStatusLabel,
  workItemStatusTone,
  type TaskTone,
  type WorkItem,
  type WorkItemStatus,
} from '../../today/index.js';

export type ScheduleWindow = {
  readonly from: LocalDate;
  readonly to: LocalDate;
};

export type ScheduleOption = {
  readonly value: string;
  readonly label: string;
};

export type ScheduleOptions = {
  readonly owners: readonly ScheduleOption[];
  readonly suppliers: readonly ScheduleOption[];
  readonly factories: readonly ScheduleOption[];
};

export type ScheduleDay = {
  readonly date: LocalDate;
  readonly label: string;
  readonly weekday: string;
  readonly isToday: boolean;
  readonly isWeekend: boolean;
};

export type TimelineBar = {
  readonly leftPercent: number;
  readonly widthPercent: number;
  readonly isCutStart: boolean;
  readonly isCutEnd: boolean;
  readonly tone: TaskTone;
  readonly label: string;
};

export type TimelineRow = {
  readonly id: string;
  readonly workItemId: string;
  readonly title: string;
  readonly meta: string;
  readonly when: string;
  readonly bar: TimelineBar;
  readonly dependencyConflicts?: readonly WorkItemPredecessor[];
};

export type TimelineGroup = {
  readonly key: string;
  readonly name: string;
  readonly counts: string;
  readonly isUnassigned: boolean;
  readonly rows: readonly TimelineRow[];
};

export type Timeline = {
  readonly days: readonly ScheduleDay[];
  readonly groups: readonly TimelineGroup[];
  readonly total: number;
  readonly todayPercent: number | null;
};

export type ScheduleKpi = {
  readonly total: number;
  readonly inProgress: number;
  readonly overdue: number;
  readonly blocked: number;
};

const UNASSIGNED = 'unassigned';
const WEEK_LENGTH = 7;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;
const OPEN_STATUSES: readonly WorkItemStatus[] = ['planned', 'in_progress', 'blocked'];
export function scheduleWindow(query: { readonly scale: ScheduleScale; readonly anchor: LocalDate }): ScheduleWindow {
  if (query.scale === 'week') {
    const from = weekStart(query.anchor);
    return { from, to: addDays(from, WEEK_LENGTH - 1) };
  }
  const from = monthStart(query.anchor);
  return { from, to: addDays(monthStart(addMonths(from, 1)), -1) };
}

export function shiftScheduleWindow(input: {
  readonly scale: ScheduleScale;
  readonly window: ScheduleWindow;
  readonly direction: -1 | 1;
}): ScheduleWindow {
  const anchor = input.direction === 1 ? addDays(input.window.to, 1) : addDays(input.window.from, -1);
  return scheduleWindow({ scale: input.scale, anchor });
}

export function scheduleWindowLabel(input: { readonly window: ScheduleWindow; readonly today: LocalDate }): string {
  return `${shortDate(input.window.from, input.today)} 至 ${shortDate(input.window.to, input.today)}`;
}

export function scheduleDays(input: { readonly window: ScheduleWindow; readonly today: LocalDate; readonly scale: ScheduleScale }): readonly ScheduleDay[] {
  const total = diffDays(input.window.to, input.window.from) + 1;
  const days: ScheduleDay[] = [];
  for (let index = 0; index < total; index += 1) {
    const date = addDays(input.window.from, index);
    days.push({
      date,
      label: input.scale === 'month' ? String(Number(date.slice(8))) : shortDate(date, input.today),
      weekday: WEEKDAYS[weekdayOf(date)] ?? '日',
      isToday: date === input.today,
      isWeekend: weekdayOf(date) === 0 || weekdayOf(date) === 6,
    });
  }
  return days;
}

export function scheduleKpi(items: readonly WorkItem[]): ScheduleKpi {
  return {
    total: items.length,
    inProgress: items.filter((item) => item.status === 'in_progress').length,
    overdue: items.filter((item) => item.overdueDays !== null).length,
    blocked: items.filter((item) => item.status === 'blocked').length,
  };
}

export function applyScheduleFilters(input: { readonly items: readonly WorkItem[]; readonly filters: ScheduleFilters }): readonly WorkItem[] {
  return input.items.filter((item) =>
    matchFilter(input.filters.ownerUserId, item.ownerUserId)
    && matchFilter(input.filters.supplierPartyId, item.supplierPartyId)
    && matchFilter(input.filters.factoryPartyId, item.factoryPartyId)
    && (input.filters.status === null || item.status === input.filters.status));
}

export function scheduleOptions(items: readonly WorkItem[]): ScheduleOptions {
  return {
    owners: optionsOf({ values: items.map((item) => ownerOption(item)), missing: '未分配' }),
    suppliers: optionsOf({ values: items.map((item) => supplierOption(item)), missing: '未指定供应商' }),
    factories: optionsOf({ values: items.map((item) => factoryOption(item)), missing: '未指定工厂' }),
  };
}

export function statusOptions(): readonly ScheduleOption[] {
  return OPEN_STATUSES.map((status) => ({ value: status, label: workItemStatusLabel(status) }));
}

export function timelineOf(input: {
  readonly items: readonly WorkItem[];
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly scale: ScheduleScale;
  readonly dependencyConflicts?: Readonly<Record<string, readonly WorkItemPredecessor[]>>;
}): Timeline {
  const conflicts = new Map(Object.entries(input.dependencyConflicts ?? {}));
  const groups = groupsOf(input.items).map((group) => ({
    key: group.key,
    name: group.name,
    counts: groupCounts(group.items),
    isUnassigned: group.key === UNASSIGNED,
    rows: group.items.map((item) => timelineRow({
      item, window: input.window, today: input.today, dependencyConflicts: conflicts.get(item.id),
    })),
  }));
  return {
    days: scheduleDays({ window: input.window, today: input.today, scale: input.scale }),
    groups,
    total: input.items.length,
    todayPercent: todayPercent({ window: input.window, today: input.today }),
  };
}

export function timelineRow(input: {
  readonly item: WorkItem;
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly dependencyConflicts?: readonly WorkItemPredecessor[] | undefined;
}): TimelineRow {
  return {
    id: taskParam(input.item.id),
    workItemId: input.item.id,
    title: input.item.title,
    meta: `${supplierText(input.item)} · ${factoryText(input.item)} · ${ownerText(input.item)}`,
    when: `${plannedRangeText(input.item, input.today)} · ${workItemStatusLabel(input.item.status)}`,
    bar: scheduleBarOf(input.item, input.window),
    ...(input.dependencyConflicts === undefined ? {} : { dependencyConflicts: input.dependencyConflicts }),
  };
}

export function todayPercent(input: { readonly window: ScheduleWindow; readonly today: LocalDate }): number | null {
  const total = diffDays(input.window.to, input.window.from) + 1;
  const offset = diffDays(input.today, input.window.from);
  if (offset < 0 || offset >= total) return null;
  return (offset / total) * 100;
}

export function scheduleBarOf(item: Pick<WorkItem, 'plannedStart' | 'plannedEnd' | 'status' | 'overdueDays'>, window: ScheduleWindow): TimelineBar {
  const total = diffDays(window.to, window.from) + 1;
  const startOffset = diffDays(item.plannedStart, window.from);
  const endOffset = diffDays(item.plannedEnd, window.from);
  const start = Math.max(0, startOffset);
  const end = Math.min(total - 1, endOffset);
  return {
    leftPercent: (start / total) * 100,
    widthPercent: ((end - start + 1) / total) * 100,
    isCutStart: startOffset < 0,
    isCutEnd: endOffset > total - 1,
    tone: workItemStatusTone(item.status),
    label: overdueText(item) ?? workItemStatusLabel(item.status),
  };
}

function groupsOf(items: readonly WorkItem[]): readonly { readonly key: string; readonly name: string; readonly items: readonly WorkItem[] }[] {
  const groups = new Map<string, { readonly name: string; readonly items: WorkItem[] }>();
  for (const item of sorted(items)) {
    const key = item.ownerUserId ?? UNASSIGNED;
    const group = groups.get(key) ?? { name: item.ownerName ?? '未分配', items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, name: group.name, items: group.items }))
    .sort((left, right) => (left.key === UNASSIGNED ? 1 : 0) - (right.key === UNASSIGNED ? 1 : 0));
}

function sorted(items: readonly WorkItem[]): readonly WorkItem[] {
  return [...items].sort((left, right) => left.plannedStart.localeCompare(right.plannedStart) || left.id.localeCompare(right.id));
}

function groupCounts(items: readonly WorkItem[]): string {
  const overdue = items.filter((item) => item.overdueDays !== null).length;
  const blocked = items.filter((item) => item.status === 'blocked').length;
  return `${items.length} 条 · 逾期 ${overdue} · 阻塞 ${blocked}`;
}

function optionsOf(input: { readonly values: readonly (ScheduleOption | null)[]; readonly missing: string }): readonly ScheduleOption[] {
  const found = new Map<string, string>();
  for (const option of input.values) {
    if (option !== null && !found.has(option.value)) found.set(option.value, option.label);
  }
  const options = [...found.entries()].map(([value, label]) => ({ value, label }));
  if (input.values.some((option) => option === null)) options.push({ value: UNASSIGNED, label: input.missing });
  return options;
}

function ownerOption(item: WorkItem): ScheduleOption | null {
  if (item.ownerUserId === null) return null;
  return { value: item.ownerUserId, label: item.ownerName ?? item.ownerUserId };
}

function supplierOption(item: WorkItem): ScheduleOption | null {
  if (item.supplierPartyId === null) return null;
  return { value: item.supplierPartyId, label: item.supplierName ?? item.supplierPartyId };
}

function factoryOption(item: WorkItem): ScheduleOption | null {
  if (item.factoryPartyId === null) return null;
  return { value: item.factoryPartyId, label: item.factoryName ?? item.factoryPartyId };
}

function matchFilter(filter: string | null, value: string | null): boolean {
  if (filter === null) return true;
  if (filter === UNASSIGNED) return value === null;
  return filter === value;
}

function monthStart(date: LocalDate): LocalDate {
  const [year, month] = date.split('-');
  if (year === undefined || month === undefined) return date;
  const parsed = parseLocalDate(`${year}-${month}-01`);
  return parsed.ok ? parsed.value : date;
}

function addMonths(date: LocalDate, months: number): LocalDate {
  const [yearText, monthText] = date.split('-');
  if (yearText === undefined || monthText === undefined) return date;
  const cursor = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + months, 1));
  const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
  const parsed = parseLocalDate(`${cursor.getUTCFullYear()}-${month}-01`);
  return parsed.ok ? parsed.value : date;
}

function weekdayOf(date: LocalDate): number {
  const [yearText, monthText, dayText] = date.split('-');
  if (yearText === undefined || monthText === undefined || dayText === undefined) return 0;
  return new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))).getUTCDay();
}
