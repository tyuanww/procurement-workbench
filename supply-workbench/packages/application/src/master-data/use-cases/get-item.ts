import type { GetItem, GetItemDeps } from '../boundary.js';

export const makeGetItem =
  (deps: GetItemDeps): GetItem =>
  async (input) => deps.master.getItem(input.itemId);
