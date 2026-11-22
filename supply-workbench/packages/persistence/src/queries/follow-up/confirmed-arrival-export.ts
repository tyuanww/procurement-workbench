import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { ConfirmedArrivalExportRow } from '../../../../application/src/follow-up/index.js';
import type { AppDatabase } from '../../client.js';
import { deliveryBatches, orderLines, purchaseOrders } from '../../schema/orders.js';
import { parties } from '../../schema/platform.js';

export async function confirmedArrivalExportRows(db: AppDatabase, lineIds: readonly string[]): Promise<readonly ConfirmedArrivalExportRow[]> {
  return db.select({
    id: deliveryBatches.id,
    po: purchaseOrders.poRaw,
    name: orderLines.nameRaw,
    seq: deliveryBatches.seq,
    warehouse: parties.displayName,
    confirmedDate: deliveryBatches.dateBuyerConfirmed,
    receiverPartyId: deliveryBatches.receiverPartyId,
    lineId: deliveryBatches.orderLineId,
  }).from(deliveryBatches)
    .innerJoin(orderLines, eq(orderLines.id, deliveryBatches.orderLineId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId))
    .leftJoin(parties, eq(parties.id, deliveryBatches.receiverPartyId))
    .where(and(inArray(orderLines.id, lineIds), isNull(deliveryBatches.closedAt), isNull(deliveryBatches.cancelledAt)))
    .orderBy(asc(purchaseOrders.poRaw), asc(orderLines.id), asc(deliveryBatches.seq), asc(deliveryBatches.id));
}
