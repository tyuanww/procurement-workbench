import { schema, type AppDatabase } from '@sw/persistence';

const at = '2026-10-12T00:00:00.000Z';

export async function insertDrillSample(db: AppDatabase): Promise<void> {
  const stamp = { createdAt: at, updatedAt: at };
  await db.insert(schema.users).values({ ...stamp, id: 'buyer-2', name: '采购乙', roles: ['buyer'], active: true });
  await db.insert(schema.purchaseOrders).values({
    ...stamp, id: 'po-m', poRaw: 'PO-M', poNorm: 'PO-M', poFormat: 'OTHER', relatedPoRaws: [], lane: 'material',
  });
  const orderLine = { ...stamp, origin: 'manual', missingInLatestImport: false, stage: 'awaiting_shipment', stageChangedAt: at };
  await db.insert(schema.orderLines).values([
    { ...orderLine, id: 'line-m', purchaseOrderId: 'po-m', lane: 'material', buyerUserId: 'buyer-1', nameRaw: '物料' },
    { ...orderLine, id: 'line-unknown', purchaseOrderId: 'po-1', lane: 'finished', nameRaw: '未归属订单' },
    { ...orderLine, id: 'line-other', purchaseOrderId: 'po-1', lane: 'finished', buyerUserId: 'buyer-2', nameRaw: '另一采购订单' },
  ]);
  const batch = { ...stamp, seq: 1, plannedQty: '1', receiverPartyId: 'warehouse', status: 'confirmed', statusChangedAt: at, dateBuyerConfirmed: '2026-10-03', origin: 'manual' };
  await db.insert(schema.deliveryBatches).values([
    { ...batch, id: 'material-late', orderLineId: 'line-m' },
    { ...batch, id: 'other-buyer-late', orderLineId: 'line-other' },
  ]);
  const exception = { ...stamp, orderLineId: 'line-unknown', type: 'other', openedBy: 'buyer-1', status: 'open' };
  await db.insert(schema.exceptions).values([
    { ...exception, id: 'unassigned-a', note: '未归属甲' },
    { ...exception, id: 'unassigned-b', note: '未归属乙' },
    { ...exception, id: 'closed', note: '已关闭', status: 'closed', closedAt: at },
    { ...exception, id: 'owned-by-line', note: '行归属', orderLineId: 'line-1' },
    { ...exception, id: 'owned-by-batch', note: '批次归属', batchId: 'overdue' },
  ]);
}
