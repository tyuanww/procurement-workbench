import type { ListAliases, ListAliasesDeps } from '../boundary.js';

export const makeListAliases =
  (deps: ListAliasesDeps): ListAliases =>
  async (input) => deps.master.listAliases(input);
