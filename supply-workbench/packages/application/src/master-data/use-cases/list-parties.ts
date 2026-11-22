import type { ListParties, ListPartiesDeps } from '../boundary.js';

export const makeListParties =
  (deps: ListPartiesDeps): ListParties =>
  async (input) => deps.master.listParties(input);
