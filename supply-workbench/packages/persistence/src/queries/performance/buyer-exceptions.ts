import type { UnassignedExceptionItem } from '@sw/application';
import { asc, desc, eq, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AppDatabase } from '../../client.js';
import { deliveryBatches, exceptions, orderLines, purchaseOrders } from '../../schema/orders.js';
import { resolveExceptionBuyer } from './index.js';

const batchLine = alias(orderLines, 'exception_batch_line');
const batchOrder = alias(purchaseOrders, 'exception_batch_order');

export async function readUnassignedBuyerExceptions(db: AppDatabase): Promise<readonly UnassignedExceptionItem[]> {
  const rows = await db.select({
    item: {
      id: exceptions.id,
      orderLineId: exceptions.orderLineId,
      batchId: exceptions.batchId,
      note: exceptions.note,
      poRaw: purchaseOrders.poRaw,
      nameRaw: orderLines.nameRaw,
    },
    lineBuyerUserId: orderLines.buyerUserId,
    batchBuyerUserId: batchLine.buyerUserId,
    batchOrderId: batchOrder.id,
  }).from(exceptions)
    .leftJoin(orderLines, eq(exceptions.orderLineId, orderLines.id))
    .leftJoin(purchaseOrders, eq(orderLines.purchaseOrderId, purchaseOrders.id))
    .leftJoin(deliveryBatches, eq(exceptions.batchId, deliveryBatches.id))
    .leftJoin(batchLine, eq(deliveryBatches.orderLineId, batchLine.id))
    .leftJoin(batchOrder, eq(batchLine.purchaseOrderId, batchOrder.id))
    // 和采购负荷事实一致，closed 之外的记录进入开放异常集合。
    .where(ne(exceptions.status, 'closed'))
    .orderBy(desc(exceptions.createdAt), asc(exceptions.id));
  return rows.flatMap((row) => resolveExceptionBuyer({
    lineBuyerUserId: row.lineBuyerUserId,
    batchBuyerUserId: row.batchOrderId === null ? null : row.batchBuyerUserId,
  }) === null ? [row.item] : []);
}
