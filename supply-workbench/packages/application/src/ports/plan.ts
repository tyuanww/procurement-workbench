import type { ProcurementScheduleDates, ProcurementScheduleQuery } from './procurement-schedule.js';
import type { DeliveryBatch } from '../../../domain/src/entities/orders.js';
import type { DependencyKind, WorkItem, WorkItemDependency, WorkItemEvent, WorkItemSubjectType } from '../../../domain/src/entities/work-items.js';
import type { EntityId } from '../../../domain/src/values/ids.js';
import type { UnitOfWork, UnitOfWorkStores } from './unit-of-work.js';
import type { DailyPlanQuery, SchedulePlanQuery, WorkItemDetailView, WorkItemListQuery, WorkItemListResult, WorkItemView } from './plan-views.js';

export type WorkItemSubjectKey = {
  readonly subjectType: WorkItemSubjectType;
  readonly subjectId: EntityId;
};

export interface WorkItemRepository {
  get(id: string): Promise<WorkItem>;
  find(id: string): Promise<WorkItem | undefined>;
  /** 插入或按 id 覆盖。事务由 PlanUnitOfWork.run 负责。 */
  save(entity: WorkItem): Promise<void>;
  /** 只有 version 仍等于 expectedVersion 才更新；返回是否写入。 */
  saveConditional(entity: WorkItem, expectedVersion: number): Promise<boolean>;
  /** 同一批 subject 上的全部 work item，用于生成的幂等与手工项保护。 */
  listBySubjects(subjects: readonly WorkItemSubjectKey[]): Promise<readonly WorkItem[]>;
}

export interface WorkItemEventRepository {
  /** 只追加，不提供 update/delete。 */
  append(event: WorkItemEvent): Promise<void>;
  listByWorkItem(workItemId: string, limit: number): Promise<readonly WorkItemEvent[]>;
}

export interface WorkItemDependencyRepository {
  save(dependency: WorkItemDependency): Promise<void>;
  remove(id: string): Promise<void>;
  findPair(input: { readonly fromItemId: string; readonly toItemId: string; readonly kind: DependencyKind }): Promise<WorkItemDependency | undefined>;
  /** 事务级串行化依赖图写入，避免两个事务同时通过环检测。 */
  lockGraph(): Promise<void>;
  /** 全图边，用于环检测；work_item_dependencies 是小数表。 */
  listAll(): Promise<readonly WorkItemDependency[]>;
  listByItem(workItemId: string): Promise<readonly WorkItemDependency[]>;
}

export type PlanStores = UnitOfWorkStores & {
  readonly procurementDates: (query: ProcurementScheduleQuery) => Promise<{ readonly dates: ProcurementScheduleDates; readonly buyerUserId: string | null }>;
  readonly workItems: WorkItemRepository;
  readonly workItemEvents: WorkItemEventRepository;
  readonly workItemDependencies: WorkItemDependencyRepository;
};

export type PlanUnitOfWork = UnitOfWork<PlanStores>;

/** 每日计划、总排期、列表和详情读模型。规则（逾期、分组、过滤）在 application 层。 */
export interface PlanQueries {
  dailyItems(query: Pick<DailyPlanQuery, 'date'>): Promise<readonly WorkItemView[]>;
  scheduleItems(query: Pick<SchedulePlanQuery, 'from' | 'to' | 'store'>): Promise<readonly WorkItemView[]>;
  projectItems(query: Pick<SchedulePlanQuery, 'from' | 'to'>): Promise<readonly WorkItemView[]>;
  listItems(query: WorkItemListQuery): Promise<WorkItemListResult>;
  getItem(query: { readonly workItemId: string; readonly eventLimit: number }): Promise<WorkItemDetailView>;
}

export type GenerationBatchSource = {
  readonly batch: DeliveryBatch;
  readonly ownerUserId: EntityId | null;
};
