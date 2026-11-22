import { expect, expectTypeOf, it } from 'vitest';
import {
  deliveryBatchId,
  entityId,
  orderLineId,
  parseEntityId,
  parseOrderLineId,
  productId,
  type DeliveryBatchId,
  type EntityId,
  type OrderLineId,
  type ProductId,
} from '../../packages/domain/src/index.js';

it('空字符串不是 id，非空字符串由对应解析器收成品牌', () => {
  expect(parseEntityId('').ok).toBe(false);
  expect(parseOrderLineId('').ok).toBe(false);
  expect(entityId('builder-1')).toBe('builder-1');
  expect(orderLineId('line-1')).toBe('line-1');
  expect(productId('prod-1')).toBe('prod-1');
  expect(deliveryBatchId('batch-1')).toBe('batch-1');
  expect(() => entityId('')).toThrow(/id 为空/);
});

it('订单行、产品和批次 id 都是实体 id，彼此不能互换', () => {
  expectTypeOf<OrderLineId>().toMatchTypeOf<EntityId>();
  expectTypeOf<ProductId>().toMatchTypeOf<EntityId>();
  expectTypeOf<DeliveryBatchId>().toMatchTypeOf<EntityId>();
  expectTypeOf<ProductId>().not.toEqualTypeOf<OrderLineId>();
});
