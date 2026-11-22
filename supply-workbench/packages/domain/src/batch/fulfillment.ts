import { DomainRuleViolation } from '../errors.js';
import { isNotProvided } from '../identity/text.js';
import type { EntityId } from '../values/ids.js';
import type { ShipmentSource } from '../vocabulary/records.js';

export const RECEIPT_DISPOSITIONS = ['normal', 'rework', 'return'] as const;
export type ReceiptDisposition = typeof RECEIPT_DISPOSITIONS[number];
export const FULFILLMENT_REVIEW_REASONS = ['unit_missing', 'unit_conflict', 'receipt_disposition'] as const;
export type FulfillmentReviewReason = typeof FULFILLMENT_REVIEW_REASONS[number];

type SourceEvidence = {
  readonly unit: string | null;
  readonly evidence: string;
};

export type ShipmentEvidenceInput = SourceEvidence & (
  | { readonly kind: 'reported' }
  | { readonly kind: 'verified'; readonly reportId?: string }
);
export type ReceiptEvidenceInput = SourceEvidence & {
  readonly kind: 'received';
  readonly disposition: ReceiptDisposition;
};

export type ShipmentEvidence = Extract<ShipmentEvidenceInput, { kind: 'reported' }> |
  (Extract<ShipmentEvidenceInput, { kind: 'verified' }> & { readonly reviewReason: FulfillmentReviewReason | null });
export type ArrivalReceiptLink = { readonly arrivalId: string; readonly revision: number };
export type ReceiptEvidence = ReceiptEvidenceInput & {
  readonly reviewReason: FulfillmentReviewReason | null;
  readonly arrival?: ArrivalReceiptLink;
};
export type FulfillmentEvidence = ShipmentEvidence | ReceiptEvidence;

type FulfillmentRecord = { readonly fulfillment?: FulfillmentEvidence | null; readonly voidedAt?: string | null };
type QuantifiedRecord = FulfillmentRecord & { readonly qty: number };
type ShipmentRecord = QuantifiedRecord & { readonly id: string; readonly fulfillment?: ShipmentEvidence | null };
type ReceiptRecord = QuantifiedRecord & { readonly fulfillment?: ReceiptEvidence | null };
type PlannedUnit = { readonly plannedUnit?: string | null };

export type BatchFulfillment = {
  readonly unit: string | null;
  readonly unshippedQty: number | null;
  readonly inTransitQty: number | null;
  readonly receivedQty: number | null;
  readonly verifiedShippedQty: number;
  readonly verifiedReceivedQty: number;
  readonly overShippedQty: number;
  readonly overReceivedQty: number;
  readonly receiptWithoutShipmentQty: number;
  readonly reviewCount: number;
};

type Remaining = { readonly unit: string | null; readonly unshippedQty: number | null };

export function compareUnshipped(left: Remaining | undefined, right: Remaining | undefined): number {
  const leftAmount = rankedRemaining(left);
  const rightAmount = rankedRemaining(right);
  if (leftAmount === null) return rightAmount === null ? 0 : 1;
  if (rightAmount === null) return -1;
  if (leftAmount.unit !== rightAmount.unit) return leftAmount.unit < rightAmount.unit ? -1 : 1;
  return rightAmount.qty - leftAmount.qty;
}

function rankedRemaining(value: Remaining | undefined): { readonly unit: string; readonly qty: number } | null {
  if (value === undefined || value.unit === null || value.unshippedQty === null) return null;
  return { unit: value.unit, qty: value.unshippedQty };
}

export function shipmentEvidence({ batch, input, shipments }: {
  readonly batch: PlannedUnit;
  readonly input: ShipmentEvidenceInput;
  readonly shipments: readonly ShipmentRecord[];
}): ShipmentEvidence {
  const facts = evidenceFields(input);
  if (input.kind === 'reported') return { kind: 'reported', ...facts };
  if (input.reportId !== undefined && (
    !shipments.some((row) => row.id === input.reportId && active(row) && row.fulfillment?.kind === 'reported') ||
    shipments.some((row) => active(row) && row.fulfillment?.kind === 'verified' && row.fulfillment.reportId === input.reportId)
  )) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '待核报发须属于此批次且未被核实', details: { state: 'shipment_report' } });
  }
  return { ...input, ...facts, reviewReason: unitReview(batch.plannedUnit, facts.unit) };
}

export function receiptEvidence(batch: PlannedUnit, input: ReceiptEvidenceInput): ReceiptEvidence {
  const facts = evidenceFields(input);
  return { ...input, ...facts, reviewReason: unitReview(batch.plannedUnit, facts.unit) ?? (input.disposition === 'normal' ? null : 'receipt_disposition') };
}

/** 旧账面合计、状态及 KPI 的准入条件。旧记录沿用原口径。 */
export function countsInRecordedQuantity(record: FulfillmentRecord): boolean {
  const facts = record.fulfillment;
  return active(record) && (facts == null || hasVerifiedEvidence(facts));
}

function hasVerifiedEvidence(facts: FulfillmentEvidence): boolean {
  return facts.kind !== 'reported' && facts.reviewReason === null && normalizeUnit(facts.unit) !== null && !isNotProvided(facts.evidence);
}

/** CG07 与 CG08 共用的批次实物数量。旧账面登记只计入待核提示。 */
export function batchFulfillment({ batch, shipments, receipts }: {
  readonly batch: PlannedUnit & { readonly plannedQty: number };
  readonly shipments: readonly ShipmentRecord[];
  readonly receipts: readonly ReceiptRecord[];
}): BatchFulfillment {
  const unit = normalizeUnit(batch.plannedUnit);
  const sent = verifiedQty(shipments);
  const received = verifiedQty(receipts);
  const plan = roundQuantity(batch.plannedQty);
  const isReceiptUnknown = unit === null || receipts.some((row) => needsReview(row) && row.fulfillment?.reviewReason !== 'receipt_disposition');
  const isMovementUnknown = isReceiptUnknown || shipments.some((row) => needsReview(row) && row.fulfillment?.kind !== 'reported');
  const verifiedReports = new Set(shipments.flatMap((row) => row.fulfillment?.kind === 'verified' && countsInRecordedQuantity(row) ? [row.fulfillment.reportId] : []));
  return {
    unit,
    unshippedQty: isMovementUnknown ? null : difference(plan, Math.max(sent, received)),
    inTransitQty: isMovementUnknown ? null : difference(sent, received),
    receivedQty: isReceiptUnknown ? null : received,
    verifiedShippedQty: sent,
    verifiedReceivedQty: received,
    overShippedQty: difference(sent, plan),
    overReceivedQty: difference(received, plan),
    receiptWithoutShipmentQty: difference(received, sent),
    reviewCount: shipments.filter((row) => needsReview(row) && !verifiedReports.has(row.id)).length + receipts.filter(needsReview).length,
  };
}

function evidenceFields(input: SourceEvidence): SourceEvidence {
  const evidence = input.evidence.trim();
  if (isNotProvided(evidence)) throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '须填写可回查的依据', details: { state: 'evidence' } });
  return { unit: normalizeUnit(input.unit), evidence };
}

export function normalizeUnit(unit: string | null | undefined): string | null {
  return unit == null || isNotProvided(unit) ? null : unit.trim();
}

function unitReview(plannedUnit: string | null | undefined, unit: string | null): FulfillmentReviewReason | null {
  const plan = normalizeUnit(plannedUnit);
  if (plan === null || unit === null) return 'unit_missing';
  return plan === unit ? null : 'unit_conflict';
}

function active(record: FulfillmentRecord): boolean {
  return record.voidedAt == null;
}

function needsReview(record: FulfillmentRecord): boolean {
  return active(record) && (record.fulfillment == null || !countsInRecordedQuantity(record));
}

function verifiedQty(rows: readonly QuantifiedRecord[]): number {
  return sumQuantities(rows.filter((row) => row.fulfillment != null && countsInRecordedQuantity(row)));
}

export function sumQuantities(rows: readonly { readonly qty: number }[]): number {
  return roundQuantity(rows.reduce((total, row) => total + roundQuantity(row.qty), 0));
}

function difference(left: number, right: number): number {
  return roundQuantity(Math.max(left - right, 0));
}

const QUANTITY_PRECISION = 4;
const decimalQuantity = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: QUANTITY_PRECISION });

export function roundQuantity(value: number): number {
  // 按数据库 numeric(18,4) 的十进制半入规则取值。
  return Number.isFinite(value) ? Number(decimalQuantity.format(value)) : value;
}

export function assertStandaloneReceipt(record: { readonly fulfillment?: ReceiptEvidence | null }): void {
  if (record.fulfillment?.arrival !== undefined) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '请在到仓待归单中更正或撤销整份凭据', details: { state: 'arrival_allocation' } });
  }
}

export function assertArrivalAllocationRevised(receipts: readonly ReceiptRecord[]): void {
  if (receipts.some((row) => active(row) && row.fulfillment?.arrival !== undefined)) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '请先在到仓待归单中更正或撤销有效分配', details: { state: 'arrival_allocation' } });
  }
}

export function assertPlannedUnitChange(batch: PlannedUnit, unit: string | undefined): void {
  const existing = normalizeUnit(batch.plannedUnit);
  if (unit !== undefined && existing !== null && existing !== unit) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '已确定的计划单位不能改动', details: { state: 'planned_unit' } });
  }
}

export function shipmentSource(input: { readonly source?: ShipmentSource; readonly factoryShipmentRowId?: EntityId | null }, state: string): { readonly source: ShipmentSource; readonly rowId: EntityId | null } {
  const source = input.source ?? 'manual';
  const rowId = input.factoryShipmentRowId ?? null;
  if (source === 'factory_report_adopted' && rowId === null) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '采纳出货必须带来源行', details: { state } });
  }
  if (source === 'manual' && rowId !== null) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '手工发货不能挂来源行', details: { state } });
  }
  return { source, rowId };
}
