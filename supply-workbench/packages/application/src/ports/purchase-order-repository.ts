import type { Lane, PurchaseOrder } from '@sw/domain';

export interface PurchaseOrderRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<PurchaseOrder>;
  /** 找不到返回 undefined。 */
  find(id: string): Promise<PurchaseOrder | undefined>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: PurchaseOrder): Promise<void>;
  /** 规范化单号相同的采购单。没有就返回空数组。 */
  listByPoNorm(poNorm: string): Promise<readonly PurchaseOrder[]>;
  /** 这一条线的无单号采购单。没有就返回空数组。 */
  listNoNumber(lane: Lane): Promise<readonly PurchaseOrder[]>;
  /** supplierPartyId 为空，且供应商原文规范化后等于 normName。没有就空数组。 */
  listMissingSupplier(normName: string): Promise<readonly PurchaseOrder[]>;
}
