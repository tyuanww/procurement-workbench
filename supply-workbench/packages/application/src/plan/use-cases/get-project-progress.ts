import type { GetProjectProgress, GetProjectProgressDeps } from '../boundary.js';
import { projectProgress } from '../progress.js';

export const makeGetProjectProgress =
  (deps: GetProjectProgressDeps): GetProjectProgress =>
  async (input) => {
    const today = deps.clock.today();
    const items = await deps.plan.projectItems({ from: input.from, to: input.to });
    return projectProgress({ from: input.from, to: input.to, today, items, includeItems: input.includeItems === true });
  };
