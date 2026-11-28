import type { FactoryReportRow, OrderLineId } from '@sw/domain';
import type { BatchDemandSource } from './delivery-batch-repository.js';

export interface FactoryReportRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<FactoryReportRow>;
  /** 读取生成事实并返回同一次读取的行版本。 */
  getForDemandGeneration(id: string): Promise<{
    readonly row: FactoryReportRow;
    readonly version: string | null;
  }>;
  /** 订单写入全部完成后，锁定仍为同一版本且归属可核对的需求行。 */
  demandSourcesAtGeneration(input: {
    readonly rowId: string;
    readonly version: string;
    readonly orderLineId: OrderLineId;
  }): Promise<ReadonlyMap<number, BatchDemandSource>>;
  /** 找不到返回 undefined。 */
  find(id: string): Promise<FactoryReportRow | undefined>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: FactoryReportRow): Promise<void>;
  /** 只关联仍未创建订单的在途行。并发认领失败时返回 false。 */
  linkUnassignedTransit(rowId: string, lineId: OrderLineId): Promise<boolean>;
  /**
   * 在途或需求事实里的品号、条码规范化后等于 codeNorm。没有就空数组。
   * 出货和库存的编码不在冻结事实上，不从 raw 猜。
   */
  listByCodeNorm(codeNorm: string): Promise<readonly FactoryReportRow[]>;
}
