import { BatchViewSchema, ReceiptViewSchema, ShipmentViewSchema, type BatchView, type ReceiptView, type ShipmentView } from '@sw/contracts';
import { normalizeUnit, type ReceiptCategory, type ReceiptEvidenceInput, type ShipmentEvidenceInput } from '@sw/domain';
import { apiSend } from '../../../shared/api/client.js';

export function postShipment(input: {
  readonly batchId: string;
  readonly qty: number;
  readonly shippedOn: string;
  readonly fulfillment?: ShipmentEvidenceInput;
}): Promise<ShipmentView> {
  return apiSend({
    path: `/api/v1/batches/${encodeURIComponent(input.batchId)}/shipments`,
    method: 'POST',
    body: { qty: input.qty, shippedOn: input.shippedOn, ...evidenceBody(input.fulfillment) },
    schema: ShipmentViewSchema,
  });
}

export function postReceipt(input: {
  readonly batchId: string;
  readonly qty: number;
  readonly receivedOn: string;
  readonly category: ReceiptCategory;
  readonly fulfillment?: ReceiptEvidenceInput;
}): Promise<ReceiptView> {
  return apiSend({
    path: `/api/v1/batches/${encodeURIComponent(input.batchId)}/receipts`,
    method: 'POST',
    body: { qty: input.qty, receivedOn: input.receivedOn, category: input.category, ...evidenceBody(input.fulfillment) },
    schema: ReceiptViewSchema,
  });
}

function evidenceBody<T extends ShipmentEvidenceInput | ReceiptEvidenceInput>(facts: T | undefined): { readonly fulfillment?: T } {
  if (facts === undefined) return {};
  return { fulfillment: { ...facts, unit: normalizeUnit(facts.unit), evidence: facts.evidence.trim() } };
}

export function postManualBatch(input: {
  readonly lineId: string;
  readonly plannedQty: number;
  readonly receiverPartyId: string;
  readonly firstBatchOnly: boolean;
}): Promise<BatchView> {
  return apiSend({
    path: `/api/v1/lines/${encodeURIComponent(input.lineId)}/batches`,
    method: 'POST',
    body: { plannedQty: input.plannedQty, receiverPartyId: input.receiverPartyId, ...(input.firstBatchOnly ? { firstBatchOnly: true } : {}) },
    schema: BatchViewSchema,
  });
}
