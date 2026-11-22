import type { ListLines, ListLinesDeps } from '../boundary.js';

export const makeListLines =
  (deps: ListLinesDeps): ListLines =>
  async (input) => deps.lines.list(input);
