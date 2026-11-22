import type { GetWorkItem, GetWorkItemDeps } from '../boundary.js';
import { annotateOverdue } from '../policies/overdue.js';

const EVENT_LIST_LIMIT = 50;

export const makeGetWorkItem =
  (deps: GetWorkItemDeps): GetWorkItem =>
  async (input) => {
    const detail = await deps.plan.getItem({ workItemId: input.workItemId, eventLimit: EVENT_LIST_LIMIT });
    return { ...detail, item: annotateOverdue([detail.item], deps.clock.today())[0] ?? detail.item };
  };
