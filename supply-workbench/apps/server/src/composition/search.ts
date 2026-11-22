import { makeSearchEverything } from '@sw/application';
import { searchQueries, type AppDatabase } from '@sw/persistence';
import type { SearchApi } from '../http/search/routes.js';

export function register(): never {
  throw new Error('搜索路由由 buildHttpApp 挂载');
}

export function composeSearch(input: { readonly db: AppDatabase }): SearchApi {
  return { search: makeSearchEverything({ search: searchQueries(input.db) }) };
}
