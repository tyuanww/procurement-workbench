import { orderLineId, parseOrderLineId, parseProductId, type OrderLineId } from './values/ids.js';

function saveLine(id: OrderLineId): OrderLineId {
  return id;
}

const product = parseProductId('prod-1');
if (!product.ok) throw new Error('fixture');
saveLine(product.value);
orderLineId(product.value);
parseOrderLineId(product.value);
