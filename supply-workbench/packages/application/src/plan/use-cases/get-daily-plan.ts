import type { GetDailyPlan, GetDailyPlanDeps } from '../boundary.js';
import { filterCounterparty } from '../policies/filters.js';
import { groupDailyPlan } from '../policies/groups.js';
import { annotateOverdue } from '../policies/overdue.js';

export const makeGetDailyPlan =
  (deps: GetDailyPlanDeps): GetDailyPlan =>
  async (input) => {
    const today = deps.clock.today();
    const items = await deps.plan.dailyItems({ date: input.date });
    const annotated = annotateOverdue(filterCounterparty(items, input), today);
    return groupDailyPlan({ date: input.date, today, items: annotated });
  };
