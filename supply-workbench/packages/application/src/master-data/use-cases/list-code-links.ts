import type { ListCodeLinks, ListCodeLinksDeps } from '../boundary.js';

export const makeListCodeLinks =
  (deps: ListCodeLinksDeps): ListCodeLinks =>
  async (input) => deps.master.listCodeLinks(input);
