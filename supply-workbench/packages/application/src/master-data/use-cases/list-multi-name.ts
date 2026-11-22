import type { ListMultiName, ListMultiNameDeps } from '../boundary.js';

export const makeListMultiName =
  (deps: ListMultiNameDeps): ListMultiName =>
  async (input) => deps.master.listMultiName(input);
