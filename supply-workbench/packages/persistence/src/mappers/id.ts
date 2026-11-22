import {
  parseDeliveryBatchId,
  parseEntityId,
  parseOrderLineId,
  parseProductId,
  type DeliveryBatchId,
  type EntityId,
  type OrderLineId,
  type ParseIdResult,
  type ProductId,
} from '@sw/domain';

type Fresh<S extends string> = S extends EntityId ? never : S;

export function entityId<S extends string>(input: Fresh<S>): EntityId;
export function entityId(input: string): EntityId {
  return required(parseEntityId(input));
}

export function entityIdOrNull<S extends string>(input: Fresh<S> | null): EntityId | null;
export function entityIdOrNull(input: string | null): EntityId | null {
  if (input === null) return null;
  return entityId(input);
}

export function orderLineId<S extends string>(input: Fresh<S>): OrderLineId;
export function orderLineId(input: string): OrderLineId {
  return required(parseOrderLineId(input));
}

export function orderLineIdOrNull<S extends string>(input: Fresh<S> | null): OrderLineId | null;
export function orderLineIdOrNull(input: string | null): OrderLineId | null {
  if (input === null) return null;
  return orderLineId(input);
}

export function productId<S extends string>(input: Fresh<S>): ProductId;
export function productId(input: string): ProductId {
  return required(parseProductId(input));
}

export function deliveryBatchId<S extends string>(input: Fresh<S>): DeliveryBatchId;
export function deliveryBatchId(input: string): DeliveryBatchId {
  return required(parseDeliveryBatchId(input));
}

export function deliveryBatchIdOrNull<S extends string>(input: Fresh<S> | null): DeliveryBatchId | null;
export function deliveryBatchIdOrNull(input: string | null): DeliveryBatchId | null {
  if (input === null) return null;
  return deliveryBatchId(input);
}

function required<Id extends EntityId>(parsed: ParseIdResult<Id>): Id {
  if (!parsed.ok) throw new Error('库存 id 为空');
  return parsed.value;
}
