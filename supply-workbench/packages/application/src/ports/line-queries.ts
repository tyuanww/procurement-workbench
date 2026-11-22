import type { ProcurementStore } from '@sw/domain';
import type { ListResult } from '../shared/page.js';
import type { BatchView, LinesQuery, LineSummary, OrderLineDetail, OrderLineRow } from '../follow-up/views.js';

export interface LineQueries {
  /** 按 05 第 4.3 节筛选。找不到的筛选条件返回空列表，不把缺失写成 0。 */
  list(query: LinesQuery): Promise<ListResult<OrderLineRow>>;
  /** 与列表相同筛选条件下的聚合计数，供页面头部指标和图表使用。 */
  summary(query: LinesQuery): Promise<LineSummary>;
  /** 找不到就抛 NotFoundError。 */
  getDetail(lineId: string, store?: ProcurementStore): Promise<OrderLineDetail>;
  /** 找不到就抛 NotFoundError。 */
  getBatch(batchId: string): Promise<BatchView>;
}
