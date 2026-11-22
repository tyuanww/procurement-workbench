import type { ListDemandRows, ListDemandRowsDeps } from '../boundary.js';

export const makeListDemandRows =
  (deps: ListDemandRowsDeps): ListDemandRows =>
  async (input) => deps.master.listDemand(input);
