import type { DeliveryBatchId, EntityId, OrderLineId, ProductId } from '@sw/domain';

export interface IdGenerator {
  next(): EntityId;
  orderLine(): OrderLineId;
  product(): ProductId;
  deliveryBatch(): DeliveryBatchId;
}
