import type { WorkItemView } from '../views.js';

export type CounterpartyFilter = {
  readonly ownerUserId?: string | undefined;
  readonly supplierPartyId?: string | undefined;
  readonly factoryPartyId?: string | undefined;
};

/** 有效供应商/工厂来自视图映射（counterparty 或订单行采购单），所以在应用层过滤。 */
export function filterCounterparty(items: readonly WorkItemView[], filter: CounterpartyFilter): readonly WorkItemView[] {
  return items.filter((item) =>
    (filter.ownerUserId === undefined || item.ownerUserId === filter.ownerUserId)
    && (filter.supplierPartyId === undefined || item.supplierPartyId === filter.supplierPartyId)
    && (filter.factoryPartyId === undefined || item.factoryPartyId === filter.factoryPartyId));
}
