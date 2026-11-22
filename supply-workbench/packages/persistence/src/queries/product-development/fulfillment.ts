import { batchFulfillment, countsInRecordedQuantity, type OrderLineId, type Shipment } from '@sw/domain';
import type { DevelopmentBatch } from '@sw/application';
import type { AppDatabase } from '../../client.js';
import { fulfillmentRecordsByLines } from '../../repositories/delivery-batches.js';

export async function developmentBatches(db: AppDatabase, lineIds: readonly OrderLineId[]): Promise<ReadonlyMap<OrderLineId, readonly DevelopmentBatch[]>> {
  const rows = await fulfillmentRecordsByLines(db, lineIds);
  const shipments = byBatch(rows.shipments);
  const receipts = byBatch(rows.receipts);
  const byLine = new Map<OrderLineId, DevelopmentBatch[]>();
  for (const batch of rows.batches) {
    if (batch.cancelledAt !== null) continue;
    const lines = byLine.get(batch.orderLineId) ?? [];
    const sent = shipments.get(batch.id) ?? [];
    lines.push({
      id: batch.id,
      seq: batch.seq,
      supplierPromisedOn: batch.dateSupplierPromised,
      buyerConfirmedOn: batch.dateBuyerConfirmed,
      fulfillment: batchFulfillment({ batch, shipments: sent, receipts: receipts.get(batch.id) ?? [] }),
      reportedShipments: pendingReports(sent),
    });
    byLine.set(batch.orderLineId, lines);
  }
  for (const batches of byLine.values()) batches.sort((left, right) => left.seq - right.seq || left.id.localeCompare(right.id));
  return byLine;
}

function pendingReports(shipments: readonly Shipment[]): DevelopmentBatch['reportedShipments'] {
  const verified = new Set(shipments.flatMap((row) => row.fulfillment?.kind === 'verified' && countsInRecordedQuantity(row) ? [row.fulfillment.reportId] : []));
  return shipments.flatMap((row) => {
    if (row.voidedAt !== null || row.fulfillment?.kind !== 'reported' || verified.has(row.id)) return [];
    return [{ quantity: row.qty, unit: row.fulfillment.unit, reportedOn: row.shippedOn, evidence: row.fulfillment.evidence }];
  }).sort((left, right) => right.reportedOn.localeCompare(left.reportedOn) || left.evidence.localeCompare(right.evidence));
}

function byBatch<T extends { readonly batchId: string }>(rows: readonly T[]): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const values = groups.get(row.batchId) ?? [];
    values.push(row);
    groups.set(row.batchId, values);
  }
  return groups;
}
