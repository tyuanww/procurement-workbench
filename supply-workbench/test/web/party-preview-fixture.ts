import { OrderLineRowSchema, PartyDetailSchema, type OrderLineRow, type PartyDetail } from '../../packages/contracts/src/index.js';

export function sampleRow(patch: {
  readonly lane?: 'finished' | 'material';
  readonly supplier?: OrderLineRow['supplier'];
  readonly factory?: OrderLineRow['factory'];
  readonly receiver?: OrderLineRow['receiver'];
}): OrderLineRow {
  return OrderLineRowSchema.parse({
    id: 'line-1',
    lane: patch.lane ?? 'finished',
    po: { id: 'po-1', poRaw: 'PO1', poFormat: 'NONE' },
    nameRaw: '面膜',
    itemCodeRaw: null,
    barcodeRaw: null,
    supplier: patch.supplier ?? { id: null, displayName: '甲代工厂', rawName: null },
    ...(patch.factory === undefined ? {} : { factory: patch.factory }),
    receiver: patch.receiver === undefined ? null : patch.receiver,
    qtyOrdered: 10,
    receivedQty: 1,
    factoryDeliveredQty: { value: null, missingReason: 'no_matching_record', provenance: { kind: 'system', rule: 'fixture', at: '2026-10-01T00:00:00.000Z' } },
    stage: 'awaiting_shipment',
    nextDue: null,
    daysInStage: 3,
    buyer: null,
    statusReported: '在途',
    missingInLatestImport: false,
    openExceptionCount: 0,
    origin: 'manual',
  });
}

export function partyDetail(id: string, name: string): PartyDetail {
  return PartyDetailSchema.parse(partyBody(id, name));
}

export function partyBody(id: string, name: string) {
  const figure = { numerator: 1, denominator: 2, n: 4 };
  const isSupplierName = id.endsWith('supplier') || id === 'party-supplier';
  return {
    party: { id, displayName: name, isSupplier: true, isFactory: id !== 'party-supplier', isOwnWarehouse: false, note: null },
    aliases: isSupplierName ? [{ id: 'alias-1', rawName: '甲代工厂原料', normName: '甲代工厂原料', partyId: id, status: 'approved', firstSeenImportBatchId: null, seenCount: 2, reviewedBy: null, reviewedAt: null, similar: [] }] : [],
    kpis: {
      dueBatches: { ...figure, n: 4 },
      onTime: { ...figure, n: 3 },
      averageDelayDays: figure,
      overdueNow: figure,
      dateChanges: figure,
      noteReturnDays: figure,
      openExceptions: figure,
    },
    kpiWindow: { from: '2026-10-01', to: '2026-11-01' },
  };
}
