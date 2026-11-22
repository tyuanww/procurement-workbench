import { and, eq, gte, inArray, lte, ne, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { OPEN_WORK_ITEM_STATUSES, type WorkItemStatus } from '../../../../domain/src/entities/work-items.js';
import type { LocalDate } from '../../../../domain/src/values/local-date.js';
import type { WorkItemListQuery } from '../../../../application/src/ports/plan-views.js';
import type { AppDatabase } from '../../client.js';
import { deliveryBatches, orderLines, purchaseOrders } from '../../schema/orders.js';
import { parties, users } from '../../schema/platform.js';
import { workItems } from '../../schema/work-items.js';

const supplierParty = alias(parties, 'supplier_party');

export type SelectOptions = {
  readonly where: SQL | undefined;
  readonly orderBy?: readonly SQL[];
};

/** work item 读模型：一次 join 出负责人、对方主体、订单行和有效供应商。 */
export async function selectWorkItems(db: AppDatabase, options: SelectOptions) {
  const query = db.select(columns()).from(workItems)
    .leftJoin(users, eq(users.id, workItems.ownerUserId))
    .leftJoin(parties, eq(parties.id, workItems.counterpartyPartyId))
    .leftJoin(deliveryBatches, and(eq(workItems.subjectType, 'delivery_batch'), eq(deliveryBatches.id, workItems.subjectId)))
    .leftJoin(orderLines, or(
      and(eq(workItems.subjectType, 'order_line'), eq(orderLines.id, workItems.subjectId)),
      and(eq(workItems.subjectType, 'delivery_batch'), eq(orderLines.id, deliveryBatches.orderLineId)),
    ))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId))
    .leftJoin(supplierParty, eq(supplierParty.id, purchaseOrders.supplierPartyId))
    .where(options.where);
  return options.orderBy === undefined ? query : query.orderBy(...options.orderBy);
}

export type JoinedRow = Awaited<ReturnType<typeof selectWorkItems>>[number];

export function openStatusList(): readonly WorkItemStatus[] {
  return OPEN_WORK_ITEM_STATUSES;
}

export function dailyWhere(date: LocalDate): SQL | undefined {
  return and(ne(workItems.subjectType, 'product_development'), inArray(workItems.status, [...openStatusList()]), lte(workItems.plannedEnd, date));
}

export function scheduleWhere(input: { readonly from: LocalDate; readonly to: LocalDate }): SQL | undefined {
  return and(ne(workItems.subjectType, 'product_development'), inArray(workItems.status, [...openStatusList()]), lte(workItems.plannedStart, input.to), gte(workItems.plannedEnd, input.from));
}

export function projectWhere(input: { readonly from: LocalDate; readonly to: LocalDate }): SQL | undefined {
  return and(ne(workItems.subjectType, 'product_development'), lte(workItems.plannedStart, input.to), gte(workItems.plannedEnd, input.from));
}

export function listWhere(query: WorkItemListQuery): SQL | undefined {
  return and(
    ne(workItems.subjectType, 'product_development'),
    query.status === undefined || query.status.length === 0 ? undefined : inArray(workItems.status, [...query.status]),
    query.ownerUserId === undefined ? undefined : eq(workItems.ownerUserId, query.ownerUserId),
    query.counterpartyPartyId === undefined ? undefined : eq(workItems.counterpartyPartyId, query.counterpartyPartyId),
    query.subjectType === undefined ? undefined : eq(workItems.subjectType, query.subjectType),
    query.subjectId === undefined ? undefined : eq(workItems.subjectId, query.subjectId),
    query.from === undefined ? undefined : gte(workItems.plannedEnd, query.from),
    query.to === undefined ? undefined : lte(workItems.plannedStart, query.to),
    query.includeClosed === true ? undefined : inArray(workItems.status, [...openStatusList()]),
  );
}

function columns() {
  return {
    id: workItems.id,
    subjectType: workItems.subjectType,
    subjectId: workItems.subjectId,
    kind: workItems.kind,
    title: workItems.title,
    ownerUserId: workItems.ownerUserId,
    ownerName: users.name,
    counterpartyPartyId: workItems.counterpartyPartyId,
    counterpartyRole: workItems.counterpartyRole,
    counterpartyName: parties.displayName,
    plannedStart: workItems.plannedStart,
    plannedEnd: workItems.plannedEnd,
    status: workItems.status,
    priority: workItems.priority,
    source: workItems.source,
    parentId: workItems.parentId,
    version: workItems.version,
    batchId: deliveryBatches.id,
    batchSeq: deliveryBatches.seq,
    batchOrderLineId: deliveryBatches.orderLineId,
    lineId: orderLines.id,
    lineName: orderLines.nameRaw,
    lineItemCode: orderLines.itemCodeRaw,
    poId: purchaseOrders.id,
    poRaw: purchaseOrders.poRaw,
    lineSupplierPartyId: purchaseOrders.supplierPartyId,
    supplierName: supplierParty.displayName,
  };
}
