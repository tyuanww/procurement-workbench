import type {
  AddWorkItemDependency,
  BuildProcurementSchedule,
  ChangeWorkItemStatus,
  CreateWorkItem,
  GenerateWorkItems,
  GetDailyPlan,
  GetProjectProgress,
  GetSchedule,
  GetWorkItem,
  ListWorkItems,
  UpdateWorkItem,
} from '@sw/application';

/**
 * 控制器只认这个结构；composition 负责把 application 用例接进来。
 * 集成后这里是 `import type { ... } from '@sw/application'` 的唯一入口。
 */
export type PlanApi = {
  createWorkItem: CreateWorkItem;
  updateWorkItem: UpdateWorkItem;
  changeStatus: ChangeWorkItemStatus;
  addDependency: AddWorkItemDependency;
  generate: GenerateWorkItems;
  buildProcurementSchedule: BuildProcurementSchedule;
  daily: GetDailyPlan;
  schedule: GetSchedule;
  progress: GetProjectProgress;
  list: ListWorkItems;
  get: GetWorkItem;
};
