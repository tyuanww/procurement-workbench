import type { SearchEverything, SearchEverythingDeps } from '../boundary.js';
import type { SearchResult } from '../views.js';
import { ValidationFailedError } from '../../shared/errors.js';

const MIN_QUERY_LENGTH = 2;
const GROUP_LIMIT = 5;

export const makeSearchEverything =
  (deps: SearchEverythingDeps): SearchEverything =>
  async (input) => {
    const q = input.q.trim();
    if (q.length < MIN_QUERY_LENGTH) throw new ValidationFailedError('至少 2 个字');
    const found = await deps.search.search({ q });
    return limit(found);
  };

function limit(found: SearchResult): SearchResult {
  return {
    lines: found.lines.slice(0, GROUP_LIMIT),
    products: found.products.slice(0, GROUP_LIMIT),
    parties: found.parties.slice(0, GROUP_LIMIT),
  };
}
