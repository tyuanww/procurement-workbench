import type { ListUnmatchedFactoryRows, ListUnmatchedFactoryRowsDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

const DEFAULT_LIMIT = 500;

export const makeListUnmatchedFactoryRows =
  (deps: ListUnmatchedFactoryRowsDeps): ListUnmatchedFactoryRows =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    if (!('scope' in input)) return { items: (await deps.links.listUnmatched()).slice(0, input.limit ?? DEFAULT_LIMIT) };
    const { scope, page, pageSize } = input;
    const rows = await deps.links.listUnmatched(scope);
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), page: { page, pageSize, total: rows.length } };
  };
