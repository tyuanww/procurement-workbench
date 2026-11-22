import type { ListItems, ListItemsDeps } from '../boundary.js';

export const makeListItems =
  (deps: ListItemsDeps): ListItems =>
  async (input) => deps.master.listItems(input);
