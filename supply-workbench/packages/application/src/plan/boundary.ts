import type { EntityId } from '../../../domain/src/values/ids.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Actor } from '../shared/actor.js';
import type { PlanQueries, PlanUnitOfWork } from './ports.js';
import type {
  AddWorkItemDependencyInput,
  ChangeWorkItemStatusInput,
  CreateWorkItemInput,
  DailyPlanQuery,
  DailyPlanView,
  GenerateWorkItemsInput,
  GenerateWorkItemsResult,
  GetWorkItemInput,
  SchedulePlanQuery,
  ScheduleView,
  UpdateWorkItemInput,
  WorkItemDetailView,
  WorkItemListQuery,
  WorkItemListResult,
} from './views.js';
import type { ProjectProgressQuery, ProjectProgressView } from './progress.js';

export type PlanWriteDeps = {
  readonly uow: PlanUnitOfWork;
  readonly clock: Clock;
  readonly ids: IdGenerator;
};

export type PlanReadDeps = {
  readonly plan: PlanQueries;
  readonly clock: Clock;
};

export type CreateWorkItem = (input: CreateWorkItemInput, actor: Actor) => Promise<{ readonly workItemId: EntityId }>;
export type UpdateWorkItem = (input: UpdateWorkItemInput, actor: Actor) => Promise<{ readonly workItemId: EntityId; readonly version: number }>;
export type ChangeWorkItemStatus = (input: ChangeWorkItemStatusInput, actor: Actor) => Promise<{ readonly workItemId: EntityId; readonly version: number }>;
export type AddWorkItemDependency = (input: AddWorkItemDependencyInput, actor: Actor) => Promise<{ readonly dependencyId: EntityId; readonly created: boolean }>;
export type GenerateWorkItems = (input: GenerateWorkItemsInput, actor: Actor) => Promise<GenerateWorkItemsResult>;
export type GetDailyPlan = (input: DailyPlanQuery, actor: Actor) => Promise<DailyPlanView>;
export type GetSchedule = (input: SchedulePlanQuery, actor: Actor) => Promise<ScheduleView>;
export type ListWorkItems = (input: WorkItemListQuery, actor: Actor) => Promise<WorkItemListResult>;
export type GetWorkItem = (input: GetWorkItemInput, actor: Actor) => Promise<WorkItemDetailView>;
export type GetProjectProgress = (input: ProjectProgressQuery, actor: Actor) => Promise<ProjectProgressView>;

export type CreateWorkItemDeps = PlanWriteDeps;
export type UpdateWorkItemDeps = PlanWriteDeps;
export type ChangeWorkItemStatusDeps = PlanWriteDeps;
export type AddWorkItemDependencyDeps = PlanWriteDeps;
export type GenerateWorkItemsDeps = PlanWriteDeps;
export type GetDailyPlanDeps = PlanReadDeps;
export type GetScheduleDeps = PlanReadDeps;
export type ListWorkItemsDeps = PlanReadDeps;
export type GetWorkItemDeps = PlanReadDeps;
export type GetProjectProgressDeps = PlanReadDeps;
