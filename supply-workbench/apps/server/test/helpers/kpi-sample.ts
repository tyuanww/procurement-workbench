import { schema, type AppDatabase } from '@sw/persistence';

const at = '2026-10-12T00:00:00.000Z';

export async function insertSample(db: AppDatabase) {
  const stamp = { createdAt: at, updatedAt: at };
  await db.insert(schema.parties).values([
    { ...stamp, id: 'supplier', displayName: '宜侬', isSupplier: true, isFactory: true, isOwnWarehouse: false, note: null },
    { ...stamp, id: 'warehouse', displayName: '上海仓', isSupplier: false, isFactory: false, isOwnWarehouse: true, note: null },
  ]);
  await db.insert(schema.users).values({ ...stamp, id: 'buyer-1', name: '样例采购员', roles: ['buyer'], feishuOpenId: null, active: true });
  await db.insert(schema.purchaseOrders).values({ ...stamp, id: 'po-1', poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER', relatedPoRaws: [], supplierPartyId: 'supplier', supplierRaw: '宜侬', lane: 'finished', oaDemandRef: null });
  await db.insert(schema.orderLines).values({ ...stamp, id: 'line-1', purchaseOrderId: 'po-1', lane: 'finished', itemId: null, itemCodeRaw: null, barcodeRaw: null, nameRaw: '面膜', qtyOrdered: null, unit: null, buyerUserId: 'buyer-1', receiverPartyId: 'warehouse', origin: 'manual', currentSnapshotId: null, candidateKey: null, missingInLatestImport: false, cancelledAt: null, cancelReason: null, stage: 'awaiting_shipment', stageChangedAt: at, nextDueBatchId: null, nextDueDate: null });
  await db.insert(schema.deliveryBatches).values(sampleBatches().map((row) => ({ ...stamp, ...row, orderLineId: 'line-1', seq: 1, plannedQty: '10', receiverPartyId: 'warehouse', origin: 'manual', originRef: null, confirmedBy: null, confirmedAt: null, closedReason: null, cancelReason: null, dateFactoryRequired: null, dateSupplierPromised: null })));
  await db.insert(schema.receipts).values([
    noteReceipt('ontime', '2026-10-05'),
    noteReceipt('late', '2026-10-08'),
    noteReceipt('noted', '2026-10-09'),
    { ...stamp, id: 'receipt-voided', batchId: 'voided', qty: '1', receivedOn: '2026-10-06', category: 'finished', source: 'manual', note: null, createdBy: 'buyer-1', voidedAt: '2026-10-07T00:00:00.000Z', voidedBy: 'buyer-1', voidReason: '作废' },
  ]);
  await db.insert(schema.shipments).values({ ...stamp, id: 'ship-noted', batchId: 'noted', qty: '1', shippedOn: '2026-10-09', source: 'manual', factoryShipmentRowId: null, note: null, createdBy: 'buyer-1', voidedAt: null, voidedBy: null, voidReason: null });
  await db.insert(schema.deliveryNotes).values({ ...stamp, id: 'note-1', batchId: 'noted', status: 'returned', returnedOn: '2026-10-11', verifiedOn: null, fileId: null, note: null, createdBy: 'buyer-1', voidedAt: null, voidedBy: null, voidReason: null });
  await db.insert(schema.batchDateChanges).values([
    change({ id: 'c1', changedAt: '2026-09-01T00:00:00.000Z', oldValue: null }),
    change({ id: 'c2', changedAt: '2026-10-09T00:00:00.000Z', oldValue: '2026-10-07' }),
    change({ id: 'c3', changedAt: '2026-10-08T00:00:00.000Z', oldValue: null }),
  ]);
  await db.insert(schema.followUps).values({ ...stamp, id: 'fu-1', orderLineId: 'line-1', batchId: 'late', kind: 'phone', text: '催了', partyId: 'supplier', createdBy: 'buyer-1' });
}

function noteReceipt(batchId: string, receivedOn: string) {
  return { createdAt: at, updatedAt: at, id: `receipt-${batchId}`, batchId, qty: '1', receivedOn, category: 'finished', source: 'manual', note: null, createdBy: 'buyer-1', voidedAt: null, voidedBy: null, voidReason: null };
}

function change({ id, changedAt, oldValue }: { readonly id: string; readonly changedAt: string; readonly oldValue: string | null }) {
  return { id, batchId: 'changed', field: 'dateBuyerConfirmed', oldValue, newValue: '2026-10-15', reason: null, changedBy: 'buyer-1', changedAt };
}

function sampleBatches() {
  return [
    head({ id: 'ontime', status: 'received', first: '2026-10-05', confirmed: '2026-10-05', statusChangedAt: '2026-10-12T00:00:00.000Z' }),
    head({ id: 'late', status: 'received', first: '2026-10-01', confirmed: '2026-10-01', statusChangedAt: '2026-10-12T00:00:00.000Z' }),
    head({ id: 'closed', status: 'closed', first: '2026-10-02', confirmed: '2026-10-02', statusChangedAt: '2026-10-12T00:00:00.000Z', closedAt: '2026-10-03T00:00:00.000Z' }),
    head({ id: 'cancelled', status: 'cancelled', first: '2026-10-03', statusChangedAt: '2026-10-12T00:00:00.000Z', cancelledAt: '2026-10-03T00:00:00.000Z' }),
    head({ id: 'overdue', status: 'confirmed', first: '2026-10-04', confirmed: '2026-10-04', statusChangedAt: '2026-10-04T00:00:00.000Z' }),
    head({ id: 'future', status: 'confirmed', first: '2026-10-20', confirmed: '2026-10-20', statusChangedAt: '2026-10-12T00:00:00.000Z' }),
    head({ id: 'due-today', status: 'confirmed', first: '2026-10-12', confirmed: '2026-10-12', statusChangedAt: '2026-10-12T00:00:00.000Z' }),
    head({ id: 'outside', status: 'received', first: '2026-09-01', statusChangedAt: '2026-10-12T00:00:00.000Z' }),
    head({ id: 'voided', status: 'confirmed', first: '2026-10-06', confirmed: '2026-10-20', statusChangedAt: '2026-10-12T00:00:00.000Z' }),
    head({ id: 'changed', status: 'confirmed', first: '2026-10-07', confirmed: '2026-10-15', statusChangedAt: '2026-09-26T00:00:00.000Z' }),
    head({ id: 'first-set', status: 'confirmed', first: '2026-10-08', confirmed: '2026-10-08', statusChangedAt: '2026-10-12T00:00:00.000Z' }),
    head({ id: 'noted', status: 'received', first: '2026-10-09', confirmed: '2026-10-09', statusChangedAt: '2026-10-12T00:00:00.000Z' }),
  ];
}

function head(input: { readonly id: string; readonly status: string; readonly first: string; readonly confirmed?: string; readonly statusChangedAt: string; readonly closedAt?: string; readonly cancelledAt?: string }) {
  return { id: input.id, status: input.status, firstConfirmedDate: input.first, dateBuyerConfirmed: input.confirmed ?? null, statusChangedAt: input.statusChangedAt, closedAt: input.closedAt ?? null, cancelledAt: input.cancelledAt ?? null };
}
