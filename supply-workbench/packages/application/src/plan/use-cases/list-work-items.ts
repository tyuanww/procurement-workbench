import type { ListWorkItems, ListWorkItemsDeps } from '../boundary.js';
import { filterCounterparty } from '../policies/filters.js';
import { annotateOverdue } from '../policies/overdue.js';

export const makeListWorkItems =
  (deps: ListWorkItemsDeps): ListWorkItems =>
  async (input) => {
    const result = await deps.plan.listItems(input);
    const annotated = annotateOverdue(filterCounterparty(result.items, input), deps.clock.today());
    return { items: annotated, page: result.page };
  };
