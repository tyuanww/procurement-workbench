const entityIdBrand: unique symbol = Symbol('EntityId');
const orderLineIdBrand: unique symbol = Symbol('OrderLineId');
const productIdBrand: unique symbol = Symbol('ProductId');
const deliveryBatchIdBrand: unique symbol = Symbol('DeliveryBatchId');

export type EntityId = string & { readonly [entityIdBrand]: 'EntityId' };
export type OrderLineId = EntityId & { readonly [orderLineIdBrand]: 'OrderLineId' };
export type ProductId = EntityId & { readonly [productIdBrand]: 'ProductId' };
export type DeliveryBatchId = EntityId & { readonly [deliveryBatchIdBrand]: 'DeliveryBatchId' };

type AlreadyBranded = string & { readonly [entityIdBrand]: 'EntityId' };
type FreshId<S extends string> = S extends AlreadyBranded ? never : S;

export type ParseIdResult<Id extends EntityId> =
  | { readonly ok: true; readonly value: Id }
  | { readonly ok: false; readonly reason: 'empty' };

export function parseEntityId<S extends string>(input: FreshId<S>): ParseIdResult<EntityId>;
export function parseEntityId(input: string): ParseIdResult<EntityId> {
  if (!isEntityId(input)) return { ok: false, reason: 'empty' };
  return { ok: true, value: input };
}

export function parseOrderLineId<S extends string>(input: FreshId<S>): ParseIdResult<OrderLineId>;
export function parseOrderLineId(input: string): ParseIdResult<OrderLineId> {
  if (!isOrderLineId(input)) return { ok: false, reason: 'empty' };
  return { ok: true, value: input };
}

export function parseProductId<S extends string>(input: FreshId<S>): ParseIdResult<ProductId>;
export function parseProductId(input: string): ParseIdResult<ProductId> {
  if (!isProductId(input)) return { ok: false, reason: 'empty' };
  return { ok: true, value: input };
}

export function parseDeliveryBatchId<S extends string>(input: FreshId<S>): ParseIdResult<DeliveryBatchId>;
export function parseDeliveryBatchId(input: string): ParseIdResult<DeliveryBatchId> {
  if (!isDeliveryBatchId(input)) return { ok: false, reason: 'empty' };
  return { ok: true, value: input };
}

export function productImageId({ productId, sha256, slot }: { readonly productId: ProductId; readonly sha256: string; readonly slot: string }): EntityId {
  return entityId(`img:${sha256}:${productId}:${slot}`);
}

export function entityId<S extends string>(input: FreshId<S>): EntityId;
export function entityId(input: string): EntityId {
  return taken(parseEntityId(input), 'id');
}

export function orderLineId<S extends string>(input: FreshId<S>): OrderLineId;
export function orderLineId(input: string): OrderLineId {
  return taken(parseOrderLineId(input), '订单行 id');
}

export function productId<S extends string>(input: FreshId<S>): ProductId;
export function productId(input: string): ProductId {
  return taken(parseProductId(input), '产品 id');
}

export function deliveryBatchId<S extends string>(input: FreshId<S>): DeliveryBatchId;
export function deliveryBatchId(input: string): DeliveryBatchId {
  return taken(parseDeliveryBatchId(input), '批次 id');
}

function taken<Id extends EntityId>(parsed: ParseIdResult<Id>, label: string): Id {
  if (!parsed.ok) throw new Error(`${label} 为空`);
  return parsed.value;
}

function isEntityId(input: string): input is EntityId {
  return input.length > 0;
}

function isOrderLineId(input: string): input is OrderLineId {
  return input.length > 0;
}

function isProductId(input: string): input is ProductId {
  return input.length > 0;
}

function isDeliveryBatchId(input: string): input is DeliveryBatchId {
  return input.length > 0;
}
