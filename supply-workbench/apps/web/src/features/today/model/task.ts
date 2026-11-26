import type { z } from 'zod';
import {
  DailyPlanSchema,
  WorkItemDetailSchema,
  WorkItemPrioritySchema,
  WorkItemSourceSchema,
  WorkItemStatusSchema,
  WorkItemViewSchema,
} from '@sw/contracts';

export type WorkItem = z.output<typeof WorkItemViewSchema>;
export type WorkItemDetail = z.output<typeof WorkItemDetailSchema>;
export type WorkItemStatus = z.output<typeof WorkItemStatusSchema>;
export type WorkItemPriority = z.output<typeof WorkItemPrioritySchema>;
export type WorkItemSource = z.output<typeof WorkItemSourceSchema>;
export type WorkItemEvent = WorkItemDetail['events'][number];
export type DailyPlan = z.output<typeof DailyPlanSchema>;

export type TaskTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success' | 'attention';

export type TaskTag = {
  readonly key: string;
  readonly label: string;
  readonly tone: TaskTone;
  readonly fill: 'solid' | 'outline';
};

export const TASK_PARAM_PREFIX = 'task:';

const STATUS_LABELS: Readonly<Record<WorkItemStatus, string>> = {
  planned: '计划中',
  in_progress: '进行中',
  blocked: '阻塞',
  done: '已完成',
  cancelled: '已取消',
};

const STATUS_TONES: Readonly<Record<WorkItemStatus, TaskTone>> = {
  planned: 'neutral',
  in_progress: 'info',
  blocked: 'danger',
  done: 'success',
  cancelled: 'neutral',
};

const SOURCE_LABELS: Readonly<Record<WorkItemSource, string>> = {
  manual: '手工任务',
  batch_milestone: '排期任务',
  import: '导入任务',
};

const PRIORITY_LABELS: Readonly<Record<WorkItemPriority, string>> = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急',
};

/** 状态机和 P3 保持一致，只用于禁用不合法的按钮；真正的拒绝在服务端。 */
const STATUS_TRANSITIONS: Readonly<Record<WorkItemStatus, readonly WorkItemStatus[]>> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['blocked', 'done', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  done: ['cancelled'],
  cancelled: [],
};

const DRAWER_STATUSES: readonly WorkItemStatus[] = ['planned', 'in_progress', 'blocked', 'done'];

export function workItemStatusLabel(status: WorkItemStatus): string {
  return STATUS_LABELS[status];
}

export function workItemStatusTone(status: WorkItemStatus): TaskTone {
  return STATUS_TONES[status];
}

export function workItemSourceLabel(source: WorkItemSource): string {
  return SOURCE_LABELS[source];
}

export function workItemPriorityLabel(priority: WorkItemPriority): string {
  return PRIORITY_LABELS[priority];
}

export function isUrgent(item: WorkItem): boolean {
  return item.priority === 'high' || item.priority === 'urgent';
}

export function isUnassigned(item: WorkItem): boolean {
  return item.ownerUserId === null;
}

export function taskParam(id: string): string {
  return `${TASK_PARAM_PREFIX}${id}`;
}

export function taskIdOf(param: string | null): string | null {
  if (param === null || !param.startsWith(TASK_PARAM_PREFIX)) return null;
  const id = param.slice(TASK_PARAM_PREFIX.length);
  return id === '' ? null : id;
}

export function shortDate(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4) ? iso.slice(5) : iso;
}

export function plannedRangeText(item: { readonly plannedStart: string; readonly plannedEnd: string }, today: string): string {
  const start = shortDate(item.plannedStart, today);
  const end = shortDate(item.plannedEnd, today);
  return start === end ? start : `${start} 至 ${end}`;
}

export function ownerText(item: WorkItem): string {
  return item.ownerName ?? '未分配';
}

export function supplierText(item: WorkItem): string {
  return item.supplierName ?? '—';
}

export function factoryText(item: WorkItem): string {
  return item.factoryName ?? '—';
}

export function taskMeta(item: WorkItem, today: string): string {
  return [item.orderLine?.poRaw, item.orderLine?.nameRaw, plannedRangeText(item, today)].filter(Boolean).join(' · ');
}

export function taskWhenText(item: WorkItem, today: string): string {
  return `${plannedRangeText(item, today)} · ${workItemStatusLabel(item.status)}`;
}

export function overdueText(item: Pick<WorkItem, 'overdueDays'>): string | null {
  if (item.overdueDays === null || item.overdueDays <= 0) return null;
  return `逾期 ${item.overdueDays} 天`;
}

/** 今天到期和逾期标签，只在排期/负责人/供应商分组里出现。 */
export function dueTag(item: WorkItem, today: string): TaskTag | null {
  const overdue = overdueText(item);
  if (overdue !== null) return { key: 'due', label: overdue, tone: 'danger', fill: 'solid' };
  if (item.plannedEnd === today) return { key: 'due', label: '今日到期', tone: 'warning', fill: 'solid' };
  return null;
}

export function taskTags(item: WorkItem, today: string): readonly TaskTag[] {
  const due = dueTag(item, today);
  return [
    { key: 'source', label: `来源 ${workItemSourceLabel(item.source)}`, tone: 'neutral', fill: 'outline' },
    {
      key: 'owner',
      label: `负责人 ${ownerText(item)}`,
      tone: item.ownerUserId === null ? 'warning' : 'neutral',
      fill: item.ownerUserId === null ? 'outline' : 'solid',
    },
    ...(item.supplierName === null ? [] : [{ key: 'supplier', label: `供应商 ${item.supplierName}`, tone: 'neutral', fill: 'solid' } satisfies TaskTag]),
    ...(item.factoryName === null ? [] : [{ key: 'factory', label: `工厂 ${item.factoryName}`, tone: 'neutral', fill: 'solid' } satisfies TaskTag]),
    { key: 'status', label: workItemStatusLabel(item.status), tone: workItemStatusTone(item.status), fill: 'solid' },
    ...(due === null ? [] : [due]),
  ];
}

export function drawerStatusOptions(): readonly WorkItemStatus[] {
  return DRAWER_STATUSES;
}

export function canSetStatus(from: WorkItemStatus, to: WorkItemStatus): boolean {
  return STATUS_TRANSITIONS[from].some((next) => next === to);
}

export function canCancel(status: WorkItemStatus): boolean {
  return canSetStatus(status, 'cancelled');
}

export function statusValueText(value: unknown): string {
  if (typeof value !== 'string') return '—';
  return isWorkItemStatus(value) ? workItemStatusLabel(value) : value;
}

export function isWorkItemStatus(value: string): value is WorkItemStatus {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, value);
}

export function eventText(event: WorkItemEvent): string {
  switch (event.kind) {
    case 'created':
      return '创建任务';
    case 'status_changed':
      return `状态从 ${statusValueText(event.oldValue)} 改为 ${statusValueText(event.newValue)}`;
    case 'date_changed':
      return `计划日期从 ${valueText(event.oldValue)} 改为 ${valueText(event.newValue)}`;
    case 'owner_changed':
      return ownerChangeText(event.ownerChange);
    case 'dependency_changed':
      return '依赖变更';
    case 'development_replied':
      return '登记新品采购回复';
    case 'development_linked':
      return '关联正式采购事项';
    default: {
      const unchecked: never = event.kind;
      return unchecked;
    }
  }
}

export function eventPartyText(party: WorkItemEvent['actor'] | WorkItemEvent['ownerAtEvent']): string {
  switch (party.presence) {
    case 'named':
      return party.name;
    case 'deleted':
      return '已删除';
    case 'unassigned':
      return '未分配';
    case 'unrecorded':
      return '未知';
    default: {
      const unchecked: never = party;
      return unchecked;
    }
  }
}

export function eventHistoryParts(event: WorkItemEvent): { readonly sentence: string; readonly actor: string; readonly owner: string } {
  return {
    sentence: eventText(event),
    actor: `实际操作人 ${eventPartyText(event.actor)}`,
    owner: `当时负责人 ${eventPartyText(event.ownerAtEvent)}`,
  };
}

function ownerChangeText(change: WorkItemEvent['ownerChange']): string {
  if (change === null) return '负责人变更';
  return `负责人从 ${eventPartyText(change.before)} 改为 ${eventPartyText(change.after)}`;
}

function valueText(value: unknown): string {
  if (typeof value === 'string' && value !== '') return value;
  return '—';
}
