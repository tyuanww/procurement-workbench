import type { ListUnmatchedFactoryRows, ListUnmatchedFactoryRowsDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

const DEFAULT_LIMIT = 500;

export const makeListUnmatchedFactoryRows =
  (deps: ListUnmatchedFactoryRowsDeps): ListUnmatchedFactoryRows =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    if (!('scope' in input)) return { items: await deps.links.listUnmatched(input.limit ?? DEFAULT_LIMIT) };
    return deps.links.listDiagnosticPage(input);
  };
