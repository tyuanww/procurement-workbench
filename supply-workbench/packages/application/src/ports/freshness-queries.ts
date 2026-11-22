import type { FreshnessResponse } from '../platform/views.js';

export interface FreshnessQueries {
  /** 没有导入过的来源 lastCommittedAt 为 null，不写成当前时间。 */
  load(): Promise<FreshnessResponse>;
}
