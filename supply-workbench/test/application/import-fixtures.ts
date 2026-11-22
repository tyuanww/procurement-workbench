import { entityId, orderLineId, productId, type Product } from '../../packages/domain/src/index.js';
import { aBatch, createMemory } from '../../packages/testkit/src/index.js';

export async function committedLine(memory: ReturnType<typeof createMemory>, at: string) {
  await memory.stores.purchaseOrders.save({ id: entityId('po-1'), createdAt: at, updatedAt: at, poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER', relatedPoRaws: [], supplierPartyId: null, supplierRaw: null, lane: 'finished', oaDemandRef: null });
  return { id: orderLineId('line-1'), createdAt: at, updatedAt: at, purchaseOrderId: entityId('po-1'), lane: 'finished' as const, itemId: null, itemCodeRaw: null, barcodeRaw: '2000000003023', nameRaw: '海葡萄', qtyOrdered: 10, unit: null, buyerUserId: null, receiverPartyId: null, origin: 'import_po_master' as const, currentSnapshotId: null, candidateKey: 'PO1|2000000003023', missingInLatestImport: false, cancelledAt: null, cancelReason: null, stage: 'no_batch' as const, stageChangedAt: at, nextDueBatchId: null, nextDueDate: null };
}

export function sampleProduct(at: string): Product {
  return { id: productId('p1'), createdAt: at, updatedAt: at, barcodeRaw: '2000000003023', barcodeBase: '2000000003023', filingName: '备案', spuKey: '备案', filingNo: null, skuName: '工作台品名', netContent: null, casePack: null, outerSize: null, productLine: null, fieldSources: { skuName: 'workbench' }, importBatchId: null, rowNo: null, editedBy: null, editedAt: null };
}

export function aCommittedBatch() {
  return aBatch().build();
}
