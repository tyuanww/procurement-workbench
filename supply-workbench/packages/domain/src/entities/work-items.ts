import type { EntityId, EntityMeta, IsoInstant } from './entity-meta.js';
import type { LocalDate } from '../values/local-date.js';

/** work item 挂在谁身上。standalone 表示不挂订单行/批次的手工项。 */
export const WORK_ITEM_SUBJECT_TYPES = ['order_line', 'delivery_batch', 'standalone', 'product_development'] as const;
export type WorkItemSubjectType = (typeof WORK_ITEM_SUBJECT_TYPES)[number];

/** 里程碑（从批次日期生成）、任务（人工建）和跟进项。 */
export const WORK_ITEM_KINDS = ['milestone', 'task', 'follow_up'] as const;
export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number];

export const WORK_ITEM_STATUSES = ['planned', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const WORK_ITEM_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

/** source 记录这条项从哪里来：人工、批次里程碑或导入。 */
export const WORK_ITEM_SOURCES = ['manual', 'batch_milestone', 'import'] as const;
export type WorkItemSource = (typeof WORK_ITEM_SOURCES)[number];

/** counterparty 是这条项主要推动的外部方：供应商、工厂、客户或内部。 */
export const COUNTERPARTY_ROLES = ['supplier', 'factory', 'customer', 'internal', 'other'] as const;
export type CounterpartyRole = (typeof COUNTERPARTY_ROLES)[number];

/** 事件只追加，kind 与迁移里的 check 约束保持一致。 */
export const WORK_ITEM_EVENT_KINDS = ['created', 'status_changed', 'owner_changed', 'date_changed', 'dependency_changed', 'development_replied', 'development_linked'] as const;
export type WorkItemEventKind = (typeof WORK_ITEM_EVENT_KINDS)[number];

/** 依赖目前只有一种：from 完成后 to 才能开始。 */
export const DEPENDENCY_KINDS = ['finish_to_start'] as const;
export type DependencyKind = (typeof DEPENDENCY_KINDS)[number];

/** P3 计划 §状态机：planned → in_progress，in_progress → blocked|done，blocked → in_progress，任意状态 → cancelled。 */
export const WORK_ITEM_TRANSITIONS: Readonly<Record<WorkItemStatus, readonly WorkItemStatus[]>> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['blocked', 'done', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  done: ['cancelled'],
  cancelled: [],
};

/** 每日计划和总排期只看未结束的项。 */
export const OPEN_WORK_ITEM_STATUSES: readonly WorkItemStatus[] = ['planned', 'in_progress', 'blocked'];

export function canTransitionWorkItem(from: WorkItemStatus, to: WorkItemStatus): boolean {
  return WORK_ITEM_TRANSITIONS[from].some((status) => status === to);
}

export function isOpenWorkItemStatus(status: WorkItemStatus): boolean {
  return OPEN_WORK_ITEM_STATUSES.some((open) => open === status);
}

export function hasWorkItemDependencyConflict(input: {
  readonly kind: DependencyKind;
  readonly predecessorStatus: WorkItemStatus;
  readonly successorStatus: WorkItemStatus;
}): boolean {
  return input.kind === 'finish_to_start' && input.predecessorStatus === 'blocked' &&
    (input.successorStatus === 'in_progress' || input.successorStatus === 'blocked');
}

export type WorkItem = EntityMeta & {
  readonly subjectType: WorkItemSubjectType;
  /** standalone 时为 null；否则是订单行、批次或新品项目 id。 */
  readonly subjectId: EntityId | null;
  readonly kind: WorkItemKind;
  readonly title: string;
  readonly ownerUserId: EntityId | null;
  readonly counterpartyPartyId: EntityId | null;
  readonly counterpartyRole: CounterpartyRole | null;
  readonly plannedStart: LocalDate;
  readonly plannedEnd: LocalDate;
  readonly status: WorkItemStatus;
  readonly priority: WorkItemPriority;
  readonly source: WorkItemSource;
  readonly parentId: EntityId | null;
  /** 乐观并发：每次写入 +1。 */
  readonly version: number;
};

/** 只追加事件。 */
export type WorkItemEvent = {
  readonly id: EntityId;
  readonly workItemId: EntityId;
  readonly kind: WorkItemEventKind;
  /** 变更的字段；created 为 null。 */
  readonly field: string | null;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly actorUserId: EntityId;
  readonly note: string | null;
  readonly createdAt: IsoInstant;
};

export type WorkItemDependency = {
  readonly id: EntityId;
  readonly fromItemId: EntityId;
  readonly toItemId: EntityId;
  readonly kind: DependencyKind;
  readonly createdAt: IsoInstant;
};

/** 批次日期里可以生成里程碑的三个字段。 */
export const MILESTONE_FIELDS = ['date_buyer_confirmed', 'date_factory_required', 'date_supplier_promised'] as const;
export type MilestoneField = (typeof MILESTONE_FIELDS)[number];
