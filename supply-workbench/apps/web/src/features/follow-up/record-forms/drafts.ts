import type { ReceiptCategory, ReceiptEvidenceInput, ShipmentEvidenceInput } from '@sw/domain';
import { receiptDefaults, receiptErrors, shipmentDefaults, shipmentErrors } from './defaults.js';

export type ShipDraft = {
  readonly kind: 'ship';
  readonly batchId: string;
  readonly qty: number;
  readonly shippedOn: string;
  readonly fulfillment?: ShipmentEvidenceInput;
};

export type ReceiptDraft = {
  readonly kind: 'receipt';
  readonly batchId: string;
  readonly qty: number;
  readonly receivedOn: string;
  readonly category: ReceiptCategory;
  readonly fulfillment?: ReceiptEvidenceInput;
};

export type CreateDraft = {
  readonly kind: 'create';
  readonly lineId: string;
  readonly plannedQty: number | null;
  readonly receiverPartyId: string;
};

export type RecordDraft = ShipDraft | ReceiptDraft | CreateDraft;

export function shipDraft(input: {
  readonly batchId: string;
  readonly plannedQty: number;
  readonly shippedQty: number | null;
  readonly today: string;
}): ShipDraft {
  const defaults = shipmentDefaults({
    plannedQty: input.plannedQty,
    shippedQty: input.shippedQty === null ? 0 : input.shippedQty,
    today: input.today,
  });
  return { kind: 'ship', batchId: input.batchId, qty: defaults.qty, shippedOn: defaults.shippedOn };
}

export function receiptDraft(input: {
  readonly batchId: string;
  readonly plannedQty: number;
  readonly receivedQty: number | null;
  readonly lane: 'finished' | 'material';
  readonly today: string;
}): ReceiptDraft {
  const defaults = receiptDefaults({
    plannedQty: input.plannedQty,
    receivedQty: input.receivedQty === null ? 0 : input.receivedQty,
    today: input.today,
    lane: input.lane,
  });
  return {
    kind: 'receipt',
    batchId: input.batchId,
    qty: defaults.qty,
    receivedOn: defaults.receivedOn,
    category: defaults.category,
  };
}

export function createDraft(input: {
  readonly lineId: string;
  readonly qtyOrdered: number | null;
  readonly receiverPartyId: string | null;
  readonly warehouses: readonly { readonly id: string }[];
}): CreateDraft {
  return {
    kind: 'create',
    lineId: input.lineId,
    plannedQty: positiveQty(input.qtyOrdered),
    receiverPartyId: knownWarehouse(input),
  };
}

export function recordError(draft: RecordDraft, today: string): string {
  if (draft.kind === 'create') return createErrors(draft).join('；');
  const errors = draft.kind === 'ship' ? shipmentErrors({ qty: draft.qty, shippedOn: draft.shippedOn, today }) : receiptErrors({ qty: draft.qty, receivedOn: draft.receivedOn, today });
  if (draft.fulfillment !== undefined && draft.fulfillment.evidence.trim() === '') return [...errors, '填写可回查的依据'].join('；');
  return errors.join('；');
}

export function draftTitle(draft: RecordDraft | null): string {
  if (draft === null) return '记录';
  if (draft.kind === 'ship') return '登记发货';
  if (draft.kind === 'receipt') return '登记收货';
  return '新增批次';
}

function positiveQty(qty: number | null): number | null {
  if (qty === null || !(qty > 0)) return null;
  return qty;
}

function knownWarehouse(input: {
  readonly receiverPartyId: string | null;
  readonly warehouses: readonly { readonly id: string }[];
}): string {
  const id = input.receiverPartyId;
  if (id === null) return '';
  if (input.warehouses.some((row) => row.id === id)) return id;
  return '';
}

function createErrors(draft: CreateDraft): readonly string[] {
  const errors: string[] = [];
  if (draft.plannedQty === null || !(draft.plannedQty > 0)) errors.push('数量必须大于 0');
  if (draft.receiverPartyId === '') errors.push('先选择收货方');
  return errors;
}
