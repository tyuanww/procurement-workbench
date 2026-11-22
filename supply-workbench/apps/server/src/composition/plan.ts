import {
  makeAddWorkItemDependency,
  makeBuildProcurementSchedule,
  makeChangeWorkItemStatus,
  makeCreateWorkItem,
  makeGenerateWorkItems,
  makeGetDailyPlan,
  makeGetProjectProgress,
  makeGetSchedule,
  makeGetWorkItem,
  makeListWorkItems,
  makeUpdateWorkItem,
} from '@sw/application';
import { planQueries, planUnitOfWork, type AppDatabase } from '@sw/persistence';
import { systemClock } from '../system/clock.js';
import { systemIds } from '../system/ids.js';
import type { PlanApi } from '../http/plan/api.js';

type Clock = { now(): string; today(): ReturnType<ReturnType<typeof systemClock>['today']> };

export function register(): never {
  throw new Error('排期路由由 buildHttpApp 挂载');
}

export function composePlan(input: { readonly db: AppDatabase; readonly timeZone: string; readonly clock?: Clock }): PlanApi {
  const clock = input.clock ?? systemClock(input.timeZone);
  const read = { plan: planQueries(input.db), clock };
  const write = { uow: planUnitOfWork(input.db), clock, ids: systemIds() };
  return {
    createWorkItem: makeCreateWorkItem(write),
    updateWorkItem: makeUpdateWorkItem(write),
    changeStatus: makeChangeWorkItemStatus(write),
    addDependency: makeAddWorkItemDependency(write),
    generate: makeGenerateWorkItems(write),
    buildProcurementSchedule: makeBuildProcurementSchedule(write),
    daily: makeGetDailyPlan(read),
    schedule: makeGetSchedule(read),
    progress: makeGetProjectProgress(read),
    list: makeListWorkItems(read),
    get: makeGetWorkItem(read),
  };
}
