import type { Actor } from '../shared/actor.js';
import type { SearchQueries } from '../ports/search-queries.js';
import type { SearchQuery, SearchResult } from './views.js';

export type * from './views.js';

export type SearchEverythingDeps = { readonly search: SearchQueries };
export type SearchEverything = (input: SearchQuery, actor: Actor) => Promise<SearchResult>;
