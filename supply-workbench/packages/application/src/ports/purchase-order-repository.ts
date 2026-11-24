import type { EntityId, Lane, PurchaseOrder } from '@sw/domain';

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
  /** 只在 supplierPartyId 为空且供应商原文匹配时回填，返回实际更新的采购单 ID。 */
  backfillMissingSupplier(input: { readonly normName: string; readonly partyId: EntityId; readonly at: string }): Promise<readonly EntityId[]>;
}
