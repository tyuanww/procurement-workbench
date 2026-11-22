import { schema, type AppDatabase } from '@sw/persistence';

export const at = '2026-10-13T00:00:00.000Z';
const stamp = { createdAt: at, updatedAt: at };
const BUYER_A = '0199f0a0-0000-7000-8000-000000000002';
const BUYER_B = '0199f0a0-0000-7000-8000-000000000003';

export async function seedLines(db: AppDatabase): Promise<void> {
  await db.insert(schema.users).values({ ...stamp, id: 'user-none', name: '无角色', roles: [], feishuOpenId: null, active: true });
  await db.insert(schema.parties).values([
    party({ id: 'sup-a', displayName: '甲厂', isSupplier: true }),
    party({ id: 'sup-b', displayName: '乙厂', isSupplier: true }),
    party({ id: 'recv-a', displayName: '甲仓', isSupplier: false }),
  ]);
  await db.insert(schema.purchaseOrders).values([
    order({ id: 'po-a', poRaw: 'PO-A', supplierPartyId: 'sup-a', lane: 'finished' }),
    order({ id: 'po-b', poRaw: 'PO-B', supplierPartyId: 'sup-a', lane: 'finished' }),
    order({ id: 'po-c', poRaw: 'PO-C', supplierPartyId: 'sup-b', lane: 'finished' }),
    order({ id: 'po-m', poRaw: 'PO-M', supplierPartyId: 'sup-a', lane: 'material' }),
  ]);
  await db.insert(schema.orderLines).values([
    { ...line({ id: 'line-a', purchaseOrderId: 'po-a', lane: 'finished', nameRaw: '棉片', buyerUserId: BUYER_A, qtyOrdered: '0', barcodeRaw: 'SECRET-A', itemCodeRaw: 'ITEM-A', nextDueDate: '2026-10-01', nextDueBatchId: 'due-a' }), stage: 'awaiting_receipt' },
    line({ id: 'line-b', purchaseOrderId: 'po-b', lane: 'finished', nameRaw: null, buyerUserId: BUYER_A, qtyOrdered: null, barcodeRaw: 'SECRET-B', itemCodeRaw: 'ITEM-B', nextDueDate: null, nextDueBatchId: null }),
    line({ id: 'line-c', purchaseOrderId: 'po-c', lane: 'finished', nameRaw: '宜侬款纸盒', buyerUserId: BUYER_B, qtyOrdered: '4', barcodeRaw: 'SECRET-C', itemCodeRaw: 'ITEM-C', nextDueDate: null, nextDueBatchId: null }),
    line({ id: 'line-m', purchaseOrderId: 'po-m', lane: 'material', nameRaw: '瓶', buyerUserId: BUYER_A, qtyOrdered: '0', barcodeRaw: 'SECRET-M', itemCodeRaw: 'ITEM-M', nextDueDate: null, nextDueBatchId: 'batch-m', receiverPartyId: 'recv-a' }),
  ]);
  await db.insert(schema.deliveryBatches).values({
    ...stamp,
    id: 'batch-m',
    orderLineId: 'line-m',
    seq: 1,
    plannedQty: '1',
    receiverPartyId: 'recv-a',
    dateFactoryRequired: '2026-11-02',
    status: 'awaiting_date',
    statusChangedAt: at,
    origin: 'manual',
  });
}

export async function seedFactoryTransit(db: AppDatabase): Promise<void> {
  const factoryId = await seedYinongParty(db);
  const extra = ['transit', 'settled', 'closed', 'legacy', 'voided'];
  await db.insert(schema.purchaseOrders).values(extra.map((key) => order({ id: `po-${key}`, poRaw: `PO-${key}`, supplierPartyId: 'sup-b', lane: 'finished' })));
  await db.insert(schema.orderLines).values(extra.map((key) => ({
    ...line({ id: `line-${key}`, purchaseOrderId: `po-${key}`, lane: 'finished', nameRaw: key, buyerUserId: BUYER_B, qtyOrdered: '10', barcodeRaw: key, itemCodeRaw: key, nextDueDate: null, nextDueBatchId: null }),
    stage: key === 'settled' || key === 'closed' ? 'done' : 'awaiting_receipt',
  })));
  await db.insert(schema.lineFactoryLinks).values(['a', 'b', 'c', 'm', ...extra].map((key) => ({
    ...stamp, id: `link-${key}`, orderLineId: `line-${key}`, factoryPartyId: key === 'c' ? 'sup-b' : factoryId,
    status: key === 'm' ? 'manual' : 'linked', source: 'manual', confidence: 'manual', linkedAt: at,
  })));
  const batches = [
    { id: 'due-a', lineId: 'line-a' },
    { id: 'other-a', lineId: 'line-a', seq: 2 },
    { id: 'second-m', lineId: 'line-m', seq: 2 },
    ...['b', 'c', ...extra].map((key) => ({ id: `batch-${key}`, lineId: `line-${key}` })),
  ];
  const day = '2026-10-13';
  const verified = { kind: 'verified', unit: '盒', evidence: '核实依据', reviewReason: null } satisfies NonNullable<typeof schema.shipments.$inferInsert.fulfillment>;
  const reported = { kind: 'reported', unit: '盒', evidence: '工厂报发' } satisfies NonNullable<typeof schema.shipments.$inferInsert.fulfillment>;
  const received = { kind: 'received', disposition: 'normal', unit: '盒', evidence: '签收依据', reviewReason: null } satisfies NonNullable<typeof schema.receipts.$inferInsert.fulfillment>;
  await db.insert(schema.deliveryBatches).values(batches.map(({ id, lineId, seq }) => ({
    ...stamp, id, orderLineId: lineId, seq: seq ?? 1, plannedQty: '8', plannedUnit: '盒', receiverPartyId: 'recv-a',
    status: id === 'batch-closed' ? 'closed' : id === 'batch-settled' ? 'received' : id === 'batch-b' ? 'confirmed' : 'shipped',
    statusChangedAt: at, origin: 'manual', closedAt: id === 'batch-closed' ? at : null,
  })));
  await db.insert(schema.shipments).values(batches.map(({ id }) => ({
    ...stamp, id: `shipment-${id}`, batchId: id, qty: '8', shippedOn: day, source: 'manual', createdBy: BUYER_A,
    fulfillment: id === 'batch-legacy' ? null : id === 'batch-b' ? reported : verified,
    voidedAt: id === 'batch-voided' ? at : null,
  })));
  await db.insert(schema.receipts).values([{ id: 'due-a', qty: '2' }, { id: 'batch-settled', qty: '8' }].map(({ id, qty }) => ({
    ...stamp, id: `receipt-${id}`, batchId: id, qty, receivedOn: day, category: 'finished', source: 'workbench', createdBy: BUYER_A,
    fulfillment: received,
  })));
}

async function seedYinongParty(db: AppDatabase): Promise<string> {
  const factoryId = 'factory-13';
  await db.insert(schema.parties).values(party({ id: factoryId, displayName: '宜侬制造', isSupplier: true }));
  await db.insert(schema.partyAliases).values({
    ...stamp, id: 'alias-13', rawName: '宜侬', normName: '宜侬', partyId: factoryId, status: 'approved',
    firstSeenImportBatchId: null, seenCount: 1, reviewedBy: BUYER_B, reviewedAt: at,
  });
  return factoryId;
}

function party(input: { readonly id: string; readonly displayName: string; readonly isSupplier: boolean }) {
  return { ...stamp, id: input.id, displayName: input.displayName, isSupplier: input.isSupplier, isFactory: input.isSupplier, isOwnWarehouse: !input.isSupplier, note: null };
}

function order(input: { readonly id: string; readonly poRaw: string; readonly supplierPartyId: string; readonly lane: string }) {
  return { ...stamp, id: input.id, poRaw: input.poRaw, poNorm: input.poRaw, poFormat: 'OTHER', relatedPoRaws: [], supplierPartyId: input.supplierPartyId, supplierRaw: input.poRaw, lane: input.lane, oaDemandRef: null };
}

function line(input: { readonly id: string; readonly purchaseOrderId: string; readonly lane: string; readonly nameRaw: string | null; readonly buyerUserId: string; readonly qtyOrdered: string | null; readonly barcodeRaw: string; readonly itemCodeRaw: string; readonly nextDueDate: string | null; readonly nextDueBatchId: string | null; readonly receiverPartyId?: string }) {
  return {
    ...stamp,
    ...input,
    receiverPartyId: input.receiverPartyId ?? null,
    itemId: null,
    unit: null,
    origin: 'manual',
    candidateKey: null,
    missingInLatestImport: false,
    latestImportPresence: 'not_applicable',
    cancelledAt: null,
    cancelReason: null,
    stage: 'no_batch',
    stageChangedAt: at,
    currentSnapshotId: null,
  };
}
