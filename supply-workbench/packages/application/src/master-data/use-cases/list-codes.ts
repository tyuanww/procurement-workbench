import type { ListCodes, ListCodesDeps } from '../boundary.js';

export const makeListCodes =
  (deps: ListCodesDeps): ListCodes =>
  async (input) => deps.master.listCodes(input);
