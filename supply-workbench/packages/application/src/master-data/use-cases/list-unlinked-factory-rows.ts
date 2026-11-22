import type { ListUnlinkedFactoryRows, ListUnlinkedFactoryRowsDeps } from '../boundary.js';

export const makeListUnlinkedFactoryRows =
  (deps: ListUnlinkedFactoryRowsDeps): ListUnlinkedFactoryRows =>
  async (input) => deps.master.listUnlinked(input);
