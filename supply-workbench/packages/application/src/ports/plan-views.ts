import type {
  CounterpartyRole,
  DependencyKind,
  WorkItemEventKind,
  WorkItemKind,
  WorkItemPriority,
  WorkItemSource,
  WorkItemStatus,
  WorkItemSubjectType,
} from '../../../domain/src/entities/work-items.js';
import type { ProcurementStore } from '../../../domain/src/procurement-store.js';
import type { EntityId } from '../../../domain/src/values/ids.js';
import type { LocalDate } from '../../../domain/src/values/local-date.js';
import type { ListResult, PageQuery } from '../shared/page.js';

export type WorkItemLineRefView = {
  readonly id: string;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly itemCodeRaw: string | null;
  readonly supplierPartyId: string | null;
};

export type WorkItemBatchRefView = {
  readonly id: string;
  readonly seq: number;
  readonly orderLineId: string;
};

export type WorkItemView = {
  readonly id: string;
  readonly subjectType: WorkItemSubjectType;
  readonly subjectId: string | null;
  readonly kind: WorkItemKind;
  readonly title: string;
  readonly ownerUserId: string | null;
  readonly ownerName: string | null;
  readonly counterpartyPartyId: string | null;
  readonly counterpartyRole: CounterpartyRole | null;
  readonly counterpartyName: string | null;
  readonly plannedStart: LocalDate;
  readonly plannedEnd: LocalDate;
  readonly status: WorkItemStatus;
  readonly priority: WorkItemPriority;
  readonly source: WorkItemSource;
  readonly parentId: string | null;
  readonly version: number;
  readonly overdueDays: number | null;
  readonly orderLine: WorkItemLineRefView | null;
  readonly batch: WorkItemBatchRefView | null;
  /** 有效供应商：counterparty 是供应商时用它，否则回退订单行的采购单供应商。 */
  readonly supplierPartyId: string | null;
  readonly supplierName: string | null;
  /** 有效工厂：只有 counterparty 角色是工厂时才有值。 */
  readonly factoryPartyId: string | null;
  readonly factoryName: string | null;
};

export type EventActor =
  | { readonly presence: 'named'; readonly userId: string; readonly name: string }
  | { readonly presence: 'deleted'; readonly userId: string }
  | { readonly presence: 'unrecorded' };

export type EventOwner =
  | { readonly presence: 'named'; readonly userId: string; readonly name: string }
  | { readonly presence: 'deleted'; readonly userId: string }
  | { readonly presence: 'unassigned' }
  | { readonly presence: 'unrecorded' };

export type WorkItemEventView = {
  readonly id: string;
  readonly workItemId: string;
  readonly kind: WorkItemEventKind;
  readonly field: string | null;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly actorUserId: string;
  readonly actor: EventActor;
  readonly ownerAtEvent: EventOwner;
  readonly ownerChange: { readonly before: EventOwner; readonly after: EventOwner } | null;
  readonly note: string | null;
  readonly createdAt: string;
};

export type WorkItemDependencyView = {
  readonly id: string;
  readonly fromItemId: string;
  readonly toItemId: string;
  readonly kind: DependencyKind;
  readonly createdAt: string;
};

export type WorkItemPredecessor = Pick<WorkItemView, 'id' | 'title' | 'plannedEnd' | 'status'>;

export type IncomingWorkItemDependency = WorkItemDependencyView & {
  readonly predecessor: WorkItemPredecessor | null;
};

export type WorkItemDependencyConflicts = Readonly<Record<string, readonly WorkItemPredecessor[]>>;

export type WorkItemDetailView = {
  readonly item: WorkItemView;
  readonly events: readonly WorkItemEventView[];
  readonly dependenciesOut: readonly WorkItemDependencyView[];
  readonly dependenciesIn: readonly IncomingWorkItemDependency[];
};

export type PlanGroupView = {
  readonly key: string;
  readonly label: string | null;
  readonly items: readonly WorkItemView[];
};

/** 每日计划：planned_end 等于今天或已逾期，按负责人和供应商/工厂分组。 */
export type DailyPlanView = {
  readonly date: LocalDate;
  readonly asOf: LocalDate;
  readonly total: number;
  readonly overdueCount: number;
  readonly items: readonly WorkItemView[];
  readonly byOwner: readonly PlanGroupView[];
  readonly bySupplier: readonly PlanGroupView[];
  readonly byFactory: readonly PlanGroupView[];
};

export type ScheduleView = {
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly total: number;
  readonly items: readonly WorkItemView[];
  readonly dependencyConflicts: WorkItemDependencyConflicts;
};

export type DailyPlanQuery = {
  readonly date: LocalDate;
  readonly ownerUserId?: string;
  readonly supplierPartyId?: string;
  readonly factoryPartyId?: string;
};

export type SchedulePlanQuery = {
  readonly store?: ProcurementStore;
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly ownerUserId?: string;
  readonly supplierPartyId?: string;
  readonly factoryPartyId?: string;
};

export type WorkItemListQuery = PageQuery & {
  readonly status?: readonly WorkItemStatus[];
  readonly ownerUserId?: string;
  readonly counterpartyPartyId?: string;
  readonly subjectType?: WorkItemSubjectType;
  readonly subjectId?: string;
  readonly from?: LocalDate;
  readonly to?: LocalDate;
  readonly includeClosed?: boolean;
};

export type WorkItemListResult = ListResult<WorkItemView>;

export type CreateWorkItemInput = {
  readonly subjectType: WorkItemSubjectType;
  readonly subjectId?: EntityId | null;
  readonly kind: WorkItemKind;
  readonly title: string;
  readonly ownerUserId?: EntityId | null;
  readonly counterpartyPartyId?: EntityId | null;
  readonly counterpartyRole?: CounterpartyRole | null;
  readonly plannedStart: LocalDate;
  readonly plannedEnd: LocalDate;
  readonly priority?: WorkItemPriority;
  readonly parentId?: EntityId | null;
};

export type UpdateWorkItemInput = {
  readonly workItemId: EntityId;
  readonly expectedVersion?: number;
  readonly title?: string;
  readonly ownerUserId?: EntityId | null;
  readonly counterpartyPartyId?: EntityId | null;
  readonly counterpartyRole?: CounterpartyRole | null;
  readonly plannedStart?: LocalDate;
  readonly plannedEnd?: LocalDate;
  readonly priority?: WorkItemPriority;
};

export type ChangeWorkItemStatusInput = {
  readonly workItemId: EntityId;
  readonly status: WorkItemStatus;
  readonly note?: string;
};

export type AddWorkItemDependencyInput = {
  readonly fromItemId: EntityId;
  readonly toItemId: EntityId;
};

export type RemoveWorkItemDependencyInput = {
  readonly dependencyId: EntityId;
};

export type GenerateWorkItemsInput = {
  readonly batchIds?: readonly EntityId[];
  readonly orderLineIds?: readonly EntityId[];
};

export type GenerateWorkItemsResult = {
  readonly created: number;
  readonly skipped: number;
};

export type GetWorkItemInput = {
  readonly workItemId: EntityId;
};
