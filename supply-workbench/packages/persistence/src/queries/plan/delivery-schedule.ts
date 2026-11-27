import { BATCH_STATUSES, addDays, countsInRecordedQuantity, isOpenBatch, localDate, type LocalDate } from '@sw/domain';
import { and, between, eq, exists, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DeliveryScheduleBatch, SchedulePlanQuery } from '../../../../application/src/ports/plan-views.js';
import type { AppDatabase } from '../../client.js';
import { deliveryBatches, orderLines, purchaseOrders, receipts, shipments } from '../../schema/orders.js';
import { parties, users } from '../../schema/platform.js';
import { batchFulfillmentOf } from '../batch-delivery.js';
import { activeFactoryBatchIds } from '../factory-links/snapshot-scope.js';
import { effectiveFactoryLinks } from '../factory-links/line-association.js';
import { oneOf } from '../follow-up/guards.js';
import { storeFilter } from '../store-progress/scope.js';

type DeliveryWindow = Pick<SchedulePlanQuery, 'from' | 'to' | 'store'> & { readonly today: LocalDate };
const DELIVERY_REVIEW_STATUSES = BATCH_STATUSES.filter((status) => isOpenBatch(status) || status === 'received');
const NEXT_WEEK_DAYS = 7;
const supplier = alias(parties, 'delivery_supplier');

export async function deliverySchedule(db: AppDatabase, window: DeliveryWindow): Promise<readonly DeliveryScheduleBatch[]> {
  const heads = await deliveryHeads(db, window);
  if (heads.length === 0) return [];
  const ids = heads.map(({ batch }) => batch.id);
  const [shipmentRows, receiptRows, factories] = await Promise.all([
    db.select().from(shipments).where(inArray(shipments.batchId, ids)),
    db.select().from(receipts).where(inArray(receipts.batchId, ids)),
    deliveryFactories(db, [...new Set(heads.map(({ batch }) => batch.orderLineId))]),
  ]);
  const sent = byBatch(shipmentRows);
  const received = byBatch(receiptRows);
  return heads.flatMap(({ batch, orderName, poRaw, itemCode, oaRef, buyerId, buyerName, supplierId, supplierName }) => {
    const batchReceipts = received.get(batch.id) ?? [];
    const { unit, receivedQty, unshippedQty, reviewCount } = batchFulfillmentOf({ batch, sent: sent.get(batch.id) ?? [], received: batchReceipts });
    const plannedQty = Number(batch.plannedQty);
    if (batch.status === 'received' && receivedQty !== null && receivedQty >= plannedQty
      && !dateWithin(batch.dateBuyerConfirmed, window)
      && !batchReceipts.some((receipt) => receipt.voidedAt === null && dateWithin(receipt.receivedOn, window))) return [];
    return [{
      id: batch.id, seq: batch.seq, orderLineId: batch.orderLineId, orderName, poRaw, itemCode, oaRef,
      buyer: party(buyerId, buyerName), supplier: party(supplierId, supplierName), factory: factories.get(batch.orderLineId) ?? null,
      confirmed: dateOrNull(batch.dateBuyerConfirmed), firstConfirmed: dateOrNull(batch.firstConfirmedDate),
      supplierPromised: dateOrNull(batch.dateSupplierPromised), required: dateOrNull(batch.dateFactoryRequired),
      receiptDates: [...new Set(batchReceipts.flatMap((receipt) => receipt.fulfillment?.kind === 'received' && countsInRecordedQuantity(receipt)
        ? [localDate(receipt.receivedOn)] : []))].sort(),
      status: oneOf(BATCH_STATUSES, batch.status), plannedQty,
      fulfillment: { unit, receivedQty, unshippedQty, reviewCount },
    }];
  });
}

function deliveryHeads(db: AppDatabase, { from, to, today, store }: DeliveryWindow) {
  const due = deliveryBatches.dateBuyerConfirmed;
  const requirement = deliveryBatches.dateFactoryRequired;
  const promise = deliveryBatches.dateSupplierPromised;
  const nextFrom = addDays(to, 1);
  const nextTo = addDays(to, NEXT_WEEK_DAYS);
  const receiptInWindow = db.select({ id: receipts.id }).from(receipts)
    .where(and(eq(receipts.batchId, deliveryBatches.id), isNull(receipts.voidedAt), between(receipts.receivedOn, from, to)));
  return db.select({
    batch: deliveryBatches, orderName: orderLines.nameRaw, poRaw: purchaseOrders.poRaw, itemCode: orderLines.itemCodeRaw,
    oaRef: purchaseOrders.oaDemandRef, buyerId: orderLines.buyerUserId, buyerName: users.name,
    supplierId: purchaseOrders.supplierPartyId, supplierName: supplier.displayName,
  }).from(deliveryBatches)
    .innerJoin(orderLines, eq(orderLines.id, deliveryBatches.orderLineId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId))
    .leftJoin(users, eq(users.id, orderLines.buyerUserId))
    .leftJoin(supplier, eq(supplier.id, purchaseOrders.supplierPartyId))
    .where(and(
      eq(orderLines.lane, 'finished'), isNull(orderLines.cancelledAt), isNull(deliveryBatches.cancelledAt), ne(deliveryBatches.status, 'cancelled'),
      storeFilter({ store, line: orderLines.id, hasMaterialScope: false }),
      or(between(due, from, to), exists(receiptInWindow), and(
        inArray(deliveryBatches.status, DELIVERY_REVIEW_STATUSES), isNull(deliveryBatches.closedAt),
        or(lt(due, from < today ? from : today), between(due, nextFrom, nextTo),
          between(requirement, nextFrom, nextTo), and(isNull(due), isNull(requirement), between(promise, nextFrom, nextTo))),
      )),
    ))
    .orderBy(due, purchaseOrders.poRaw, deliveryBatches.seq, deliveryBatches.id);
}

function dateWithin(date: string | null, { from, to }: DeliveryWindow): boolean {
  return date !== null && date >= from && date <= to;
}

async function deliveryFactories(db: AppDatabase, lineIds: readonly string[]) {
  const links = await effectiveFactoryLinks({ db, lineIds, activeFactoryBatchIds: await activeFactoryBatchIds(db) });
  const ids = links.flatMap((link) => link.factoryPartyId === null ? [] : [link.factoryPartyId]);
  if (ids.length === 0) return new Map<string, NonNullable<DeliveryScheduleBatch['factory']>>();
  const names = new Map((await db.select({ id: parties.id, name: parties.displayName }).from(parties).where(inArray(parties.id, ids)))
    .map((factory) => [factory.id, factory.name]));
  return new Map(links.flatMap(({ orderLineId, factoryPartyId }) => factoryPartyId === null ? [] : [[orderLineId, { id: factoryPartyId, name: names.get(factoryPartyId) ?? null }]]));
}

function byBatch<T extends { readonly batchId: string }>(rows: readonly T[]): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.batchId);
    if (bucket === undefined) grouped.set(row.batchId, [row]);
    else bucket.push(row);
  }
  return grouped;
}

function party(id: string | null, name: string | null) {
  return id === null ? null : { id, name };
}

function dateOrNull(date: string | null): LocalDate | null {
  return date === null ? null : localDate(date);
}
