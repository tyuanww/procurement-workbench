import { sql } from 'drizzle-orm';
import { orderLineSnapshots } from '../schema/orders.js';

export const reportedOrderStatus = sql<string | null>`case
  when jsonb_typeof(${orderLineSnapshots.data}->'statusReported'->'value') = 'string'
  then ${orderLineSnapshots.data}->'statusReported'->>'value'
end`;
