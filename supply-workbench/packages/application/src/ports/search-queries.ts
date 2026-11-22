import type { SearchQuery, SearchResult } from '../search/views.js';

export interface SearchQueries {
  /** q 少于 2 个字由用例拒绝，不在这里截断成空结果。每组最多 5 条。 */
  search(query: SearchQuery): Promise<SearchResult>;
}
