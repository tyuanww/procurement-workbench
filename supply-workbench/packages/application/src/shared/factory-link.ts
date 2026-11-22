import { entityId, orderLineId, type LineFactoryLink } from '@sw/domain';
import type { LineFactoryLinkRepository } from '../ports/factory-link-repository.js';
import type { UnitOfWorkStores } from '../ports/unit-of-work.js';

/** 仓储没接线时立刻失败，不静默返回无关联。 */
export function lineFactoryLinksOf(tx: UnitOfWorkStores): LineFactoryLinkRepository {
  const stores = tx.factoryLinks;
  if (stores === undefined) throw new Error('工厂关联仓储没有接线：UnitOfWorkStores.factoryLinks 为空');
  return stores;
}

/** 一个订单行只有一条当前关联，id 由订单行决定，重跑不会生成重复行。 */
export function linkIdOf(orderLineIdValue: string) {
  return entityId(`lfl:${orderLineIdValue}`);
}

export function linkOf(fields: {
  readonly id: string;
  readonly at: string;
  readonly orderLineId: string;
  readonly factoryPartyId: string | null;
  readonly status: LineFactoryLink['status'];
  readonly source: LineFactoryLink['source'];
  readonly confidence: LineFactoryLink['confidence'];
  readonly poRaw?: string | null | undefined;
  readonly itemCodeRaw?: string | null | undefined;
  readonly barcodeRaw?: string | null | undefined;
  readonly reason?: string | null | undefined;
}): LineFactoryLink {
  return {
    id: entityId(fields.id),
    createdAt: fields.at,
    updatedAt: fields.at,
    orderLineId: orderLineId(fields.orderLineId),
    factoryPartyId: fields.factoryPartyId === null ? null : entityId(fields.factoryPartyId),
    status: fields.status,
    source: fields.source,
    confidence: fields.confidence,
    poRaw: fields.poRaw ?? null,
    itemCodeRaw: fields.itemCodeRaw ?? null,
    barcodeRaw: fields.barcodeRaw ?? null,
    reason: fields.reason ?? null,
    linkedAt: fields.at,
  };
}
