import type { GetSchedule, GetScheduleDeps } from '../boundary.js';
import { filterCounterparty } from '../policies/filters.js';
import { scheduleView } from '../policies/groups.js';
import { annotateOverdue } from '../policies/overdue.js';

export const makeGetSchedule =
  (deps: GetScheduleDeps): GetSchedule =>
  async (input) => {
    const items = await deps.plan.scheduleItems(input);
    const annotated = annotateOverdue(filterCounterparty(items, input), deps.clock.today());
    return scheduleView({ from: input.from, to: input.to, items: annotated });
  };
