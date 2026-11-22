import { DomainRuleViolation } from '../errors.js';
import { isNotProvided } from '../identity/text.js';
import { UNDO_WINDOW_SECONDS } from '../policies.js';
import type { DeliveryBatch, DeliveryNote, Receipt, Shipment, BatchDateChange } from '../entities/orders.js';
import type { BatchOrigin } from '../vocabulary/index.js';
import type { DeliveryBatchId, EntityId, OrderLineId } from '../values/ids.js';
import type { LocalDate } from '../values/local-date.js';
import { assertArrivalAllocationRevised, assertPlannedUnitChange, assertStandaloneReceipt, normalizeUnit, receiptEvidence, shipmentEvidence, shipmentSource, type ArrivalReceiptLink, type ReceiptEvidenceInput, type ShipmentEvidenceInput } from './fulfillment.js';
import { deriveBatchStatus, noteStatus } from './status.js';

export type RuleContext<Id extends EntityId = EntityId> = {
  readonly at: string;
  readonly by: EntityId;
  readonly isAdmin: boolean;
  readonly nextId: Id;
};

export type BatchRecords = {
  readonly batch: DeliveryBatch;
  readonly shipments: readonly Shipment[];
  readonly receipts: readonly Receipt[];
  readonly deliveryNote: DeliveryNote | null;
};

const MS_PER_SECOND = 1000;

type NewBatchInput = {
  readonly orderLineId: OrderLineId;
  readonly seq: number;
  readonly plannedQty: number;
  readonly plannedUnit?: string | null;
  readonly receiverPartyId: EntityId;
  readonly dateBuyerConfirmed?: LocalDate | null;
  readonly dateSupplierPromised?: LocalDate | null;
  readonly dateFactoryRequired?: LocalDate | null;
  readonly origin: BatchOrigin;
  readonly originRef?: { readonly rowId: string; readonly slotIndex: number } | null;
};

export function createBatch(input: NewBatchInput, ctx: RuleContext<DeliveryBatchId>): DeliveryBatch {
  assertSeq(input.seq);
  assertPositive(input.plannedQty);
  const confirmed = input.dateBuyerConfirmed ?? null;
  const plannedUnit = normalizeUnit(input.plannedUnit);
  return withStatus({ batch: {
    id: ctx.nextId,
    createdAt: ctx.at,
    updatedAt: ctx.at,
    orderLineId: input.orderLineId,
    seq: input.seq,
    plannedQty: input.plannedQty,
    ...(plannedUnit === null ? {} : { plannedUnit }),
    receiverPartyId: input.receiverPartyId,
    dateFactoryRequired: input.dateFactoryRequired ?? null,
    dateSupplierPromised: input.dateSupplierPromised ?? null,
    dateBuyerConfirmed: confirmed,
    firstConfirmedDate: confirmed,
    confirmedBy: confirmed === null ? null : ctx.by,
    confirmedAt: confirmed === null ? null : ctx.at,
    status: 'awaiting_date',
    statusChangedAt: ctx.at,
    origin: input.origin,
    originRef: input.originRef ?? null,
    closedAt: null,
    closedReason: null,
    cancelledAt: null,
    cancelReason: null,
  }, records: { shipments: [], receipts: [] } });
}

export function applyConfirmedDate(records: Pick<BatchRecords, 'batch' | 'shipments' | 'receipts'>, input: { readonly date: LocalDate | null; readonly reason: string | null; readonly ctx: RuleContext }): { readonly batch: DeliveryBatch; readonly dateChange: BatchDateChange | null } {
  const batch = records.batch;
  const ctx = input.ctx;
  assertNotTerminal(batch, '关闭或取消的批次不能改');
  if (batch.dateBuyerConfirmed === input.date) return { batch, dateChange: null };
  if (input.date === null) assertArrivalAllocationRevised(records.receipts);
  const isFirstSet = batch.firstConfirmedDate === null;
  if (!isFirstSet) assertDateReason(input.reason);
  const changed = withStatus({ batch: {
    ...batch,
    dateBuyerConfirmed: input.date,
    firstConfirmedDate: isFirstSet ? input.date : batch.firstConfirmedDate,
    confirmedBy: ctx.by,
    confirmedAt: ctx.at,
    updatedAt: ctx.at,
  }, records: { shipments: records.shipments, receipts: records.receipts }, at: ctx.at });
  return { batch: changed, dateChange: dateChangeOf(batch, { date: input.date, reason: isFirstSet ? null : input.reason, ctx }) };
}

export function updateBatchFields({ batch, patch, records }: { readonly batch: DeliveryBatch; readonly patch: {
  readonly plannedQty?: number;
  readonly plannedUnit?: string;
  readonly receiverPartyId?: EntityId;
  readonly dateSupplierPromised?: LocalDate | null;
  readonly dateFactoryRequired?: LocalDate | null;
}; readonly records: Pick<BatchRecords, 'shipments' | 'receipts'> & Pick<RuleContext, 'at' | 'by' | 'nextId'> }): { readonly batch: DeliveryBatch; readonly dateChange: BatchDateChange | null } {
  if (patch.dateFactoryRequired !== undefined && batch.origin === 'from_factory_demand') {
    throw new DomainRuleViolation({ code: 'FIELD_OWNED_BY_IMPORT', message: '代工厂需求日归导入所有', details: { field: 'dateFactoryRequired' } });
  }
  assertNotTerminal(batch, '关闭或取消的批次不能改');
  if (patch.receiverPartyId !== undefined && patch.receiverPartyId !== batch.receiverPartyId) {
    assertArrivalAllocationRevised(records.receipts);
  }
  assertPlannedUnitChange(batch, patch.plannedUnit);
  if (patch.plannedQty !== undefined) assertPositive(patch.plannedQty);
  const dateChange = supplierDateChange({ batch, patch, ctx: records });
  return { batch: withStatus({ batch: { ...batch, ...patch, updatedAt: records.at }, records, at: records.at }), dateChange };
}

export function addShipment({ records, input, ctx }: { readonly records: BatchRecords; readonly input: { readonly qty: number; readonly shippedOn: LocalDate; readonly note?: string | null; readonly source?: Shipment['source']; readonly factoryShipmentRowId?: EntityId | null; readonly fulfillment?: ShipmentEvidenceInput }; readonly ctx: RuleContext }): BatchRecords {
  assertOpen(records.batch);
  assertPositive(input.qty);
  const linked = shipmentSource(input, records.batch.status);
  const shipment = newShipment({ batchId: records.batch.id, input: { ...input, source: linked.source, factoryShipmentRowId: linked.rowId }, ctx });
  const row = input.fulfillment === undefined ? shipment : { ...shipment, fulfillment: shipmentEvidence({ batch: records.batch, input: input.fulfillment, shipments: records.shipments }) };
  return retie({ records, shipments: [...records.shipments, row], receipts: records.receipts, deliveryNote: records.deliveryNote, at: ctx.at });
}

export function addReceipt({ records, input, ctx }: { readonly records: BatchRecords; readonly input: { readonly qty: number; readonly receivedOn: LocalDate; readonly category: Receipt['category']; readonly note?: string | null; readonly fulfillment?: ReceiptEvidenceInput; readonly arrival?: ArrivalReceiptLink }; readonly ctx: RuleContext }): BatchRecords {
  assertOpen(records.batch);
  assertPositive(input.qty);
  const receipt = newReceipt({ batchId: records.batch.id, input, ctx });
  const evidence = input.fulfillment === undefined ? null : receiptEvidence(records.batch, input.fulfillment);
  const row = evidence === null ? receipt : { ...receipt, fulfillment: input.arrival === undefined ? evidence : { ...evidence, arrival: input.arrival } };
  return retie({ records, shipments: records.shipments, receipts: [...records.receipts, row], deliveryNote: records.deliveryNote, at: ctx.at });
}

export function setDeliveryNote({ records, input, ctx }: { readonly records: BatchRecords; readonly input: { readonly status: DeliveryNote['status']; readonly date: LocalDate; readonly note?: string | null; readonly fileId?: EntityId | null }; readonly ctx: RuleContext }): BatchRecords {
  assertNotTerminal(records.batch, '关闭或取消的批次不能改');
  if (records.deliveryNote !== null && records.deliveryNote.voidedAt === null) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '已有有效送货单', details: { state: noteStatus(records.deliveryNote) } });
  }
  if (records.deliveryNote !== null) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '作废的送货单还在，不能覆盖', details: { state: 'voided' } });
  }
  const note = newNote({ batchId: records.batch.id, input, ctx });
  return { ...records, deliveryNote: note, batch: withStatus({ batch: records.batch, records, at: ctx.at }) };
}

export function closeBatch(records: Pick<BatchRecords, 'batch' | 'shipments' | 'receipts'>, input: { readonly reason: string; readonly ctx: RuleContext }): DeliveryBatch {
  assertReason(input.reason);
  assertNotTerminal(records.batch, '批次已经关闭或取消');
  return withStatus({ batch: { ...records.batch, closedAt: input.ctx.at, closedReason: input.reason, updatedAt: input.ctx.at }, records, at: input.ctx.at });
}

export function cancelBatch(records: Pick<BatchRecords, 'batch' | 'shipments' | 'receipts'>, input: { readonly reason: string; readonly ctx: RuleContext }): DeliveryBatch {
  assertReason(input.reason);
  assertNotTerminal(records.batch, '批次已经关闭或取消');
  return withStatus({ batch: { ...records.batch, cancelledAt: input.ctx.at, cancelReason: input.reason, updatedAt: input.ctx.at }, records, at: input.ctx.at });
}

export function reopenBatch(records: Pick<BatchRecords, 'batch' | 'shipments' | 'receipts'>, input: { readonly reason: string; readonly ctx: RuleContext }): DeliveryBatch {
  assertReason(input.reason);
  if (records.batch.closedAt === null && records.batch.cancelledAt === null) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '批次没有关闭或取消', details: { state: records.batch.status } });
  }
  return withStatus({ batch: {
    ...records.batch,
    closedAt: null,
    cancelledAt: null,
    closedReason: null,
    cancelReason: null,
    updatedAt: input.ctx.at,
  }, records, at: input.ctx.at });
}

export function undoRecord(records: BatchRecords, input: { readonly kind: 'shipment' | 'receipt' | 'delivery_note'; readonly recordId: string; readonly ctx: RuleContext }): BatchRecords {
  assertNotTerminal(records.batch, '关闭或取消的批次不能改');
  if (input.kind === 'receipt') assertStandaloneReceipt(findReceipt(records, input.recordId));
  const record = findRecord({ records, kind: input.kind, recordId: input.recordId });
  assertOwner(record.createdBy, input.ctx);
  assertInsideWindow(record.createdAt, input.ctx.at);
  if (input.kind === 'shipment') return retie({ records, shipments: records.shipments.filter((row) => row.id !== input.recordId), receipts: records.receipts, deliveryNote: records.deliveryNote, at: input.ctx.at });
  if (input.kind === 'receipt') return retie({ records, shipments: records.shipments, receipts: records.receipts.filter((row) => row.id !== input.recordId), deliveryNote: records.deliveryNote, at: input.ctx.at });
  return { ...records, deliveryNote: null, batch: withStatus({ batch: records.batch, records, at: input.ctx.at }) };
}

export function voidRecord(records: BatchRecords, input: { readonly kind: 'shipment' | 'receipt' | 'delivery_note'; readonly recordId: string; readonly reason: string; readonly ctx: RuleContext }): BatchRecords {
  assertNotTerminal(records.batch, '关闭或取消的批次不能改');
  assertReason(input.reason);
  if (input.kind === 'shipment') return voidShipment(records, input);
  if (input.kind === 'receipt') return voidReceipt(records, input);
  return voidNote(records, input);
}

export function assertBatchDeletable(records: BatchRecords): void {
  const hasRecords = records.shipments.length > 0 || records.receipts.length > 0 || records.deliveryNote !== null;
  if (hasRecords) throw new DomainRuleViolation({ code: 'BATCH_HAS_RECORDS', message: '批次已有记录，不能删除', details: { state: records.batch.status } });
}

function withStatus({ batch, records, at = batch.updatedAt }: { readonly batch: DeliveryBatch; readonly records: Pick<BatchRecords, 'shipments' | 'receipts'>; readonly at?: string | undefined }): DeliveryBatch {
  const status = deriveBatchStatus({ ...batch, shipments: records.shipments, receipts: records.receipts });
  return { ...batch, status, statusChangedAt: status === batch.status ? batch.statusChangedAt : at, updatedAt: at };
}

function retie(input: { readonly records: BatchRecords; readonly shipments: readonly Shipment[]; readonly receipts: readonly Receipt[]; readonly deliveryNote: DeliveryNote | null; readonly at: string }): BatchRecords {
  return { shipments: input.shipments, receipts: input.receipts, deliveryNote: input.deliveryNote, batch: withStatus({ batch: input.records.batch, records: input, at: input.at }) };
}

function assertOpen(batch: DeliveryBatch): void {
  assertNotTerminal(batch, '关闭或取消的批次不能新增记录');
}

function assertNotTerminal(batch: DeliveryBatch, message: string): void {
  if (batch.closedAt !== null || batch.cancelledAt !== null) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message, details: { state: batch.status } });
  }
}

function assertPositive(qty: number): void {
  if (!Number.isFinite(qty) || qty <= 0) throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '数量必须大于 0', details: { state: 'qty' } });
}

function assertSeq(seq: number): void {
  if (!Number.isInteger(seq) || seq < 1) throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '批次序号必须从 1 开始', details: { state: 'seq' } });
}

function assertDateReason(reason: string | null): void {
  if (reason === null || isNotProvided(reason)) throw new DomainRuleViolation({ code: 'DATE_CHANGE_REASON_REQUIRED', message: '修改已有确认到货日没写原因' });
}

function assertReason(reason: string): void {
  if (reason.trim() === '') throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '必须写原因', details: { state: 'reason' } });
}

function assertOwner(createdBy: string, ctx: RuleContext): void {
  if (createdBy !== ctx.by) throw new DomainRuleViolation({ code: 'UNDO_NOT_OWNER', message: '只能撤销自己的记录' });
}

function assertInsideWindow(createdAt: string, at: string): void {
  if (elapsedSeconds(at, createdAt) > UNDO_WINDOW_SECONDS) {
    throw new DomainRuleViolation({ code: 'UNDO_WINDOW_EXPIRED', message: '超过撤销窗口' });
  }
}

function assertOutsideWindow(createdAt: string, at: string): void {
  if (elapsedSeconds(at, createdAt) <= UNDO_WINDOW_SECONDS) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '还在撤销窗口内，请撤销而不是作废', details: { state: 'undo_window' } });
  }
}

function elapsedSeconds(later: string, earlier: string): number {
  const elapsed = (Date.parse(later) - Date.parse(earlier)) / MS_PER_SECOND;
  if (!Number.isFinite(elapsed)) throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '时间无法比较', details: { state: 'time' } });
  return elapsed;
}

function supplierDateChange({ batch, patch, ctx }: { readonly batch: DeliveryBatch; readonly patch: { readonly dateSupplierPromised?: LocalDate | null }; readonly ctx: Pick<RuleContext, 'at' | 'by' | 'nextId'> }): BatchDateChange | null {
  if (patch.dateSupplierPromised === undefined || patch.dateSupplierPromised === batch.dateSupplierPromised) return null;
  return { id: ctx.nextId, batchId: batch.id, field: 'dateSupplierPromised', oldValue: batch.dateSupplierPromised, newValue: patch.dateSupplierPromised, reason: null, changedBy: ctx.by, changedAt: ctx.at };
}

function dateChangeOf(batch: DeliveryBatch, input: { readonly date: LocalDate | null; readonly reason: string | null; readonly ctx: RuleContext }): BatchDateChange {
  return { id: input.ctx.nextId, batchId: batch.id, field: 'dateBuyerConfirmed', oldValue: batch.dateBuyerConfirmed, newValue: input.date, reason: input.reason, changedBy: input.ctx.by, changedAt: input.ctx.at };
}

function newShipment({ batchId, input, ctx }: { readonly batchId: DeliveryBatchId; readonly input: { readonly qty: number; readonly shippedOn: LocalDate; readonly note?: string | null; readonly source: Shipment['source']; readonly factoryShipmentRowId: EntityId | null }; readonly ctx: RuleContext }): Shipment {
  return { id: ctx.nextId, createdAt: ctx.at, updatedAt: ctx.at, batchId, qty: input.qty, shippedOn: input.shippedOn, source: input.source, factoryShipmentRowId: input.factoryShipmentRowId, note: input.note ?? null, createdBy: ctx.by, voidedAt: null, voidedBy: null, voidReason: null };
}

function newReceipt({ batchId, input, ctx }: { readonly batchId: DeliveryBatchId; readonly input: { readonly qty: number; readonly receivedOn: LocalDate; readonly category: Receipt['category']; readonly note?: string | null }; readonly ctx: RuleContext }): Receipt {
  return { id: ctx.nextId, createdAt: ctx.at, updatedAt: ctx.at, batchId, qty: input.qty, receivedOn: input.receivedOn, category: input.category, source: 'workbench', note: input.note ?? null, createdBy: ctx.by, voidedAt: null, voidedBy: null, voidReason: null };
}

function newNote({ batchId, input, ctx }: { readonly batchId: DeliveryBatchId; readonly input: { readonly status: DeliveryNote['status']; readonly date: LocalDate; readonly note?: string | null; readonly fileId?: EntityId | null }; readonly ctx: RuleContext }): DeliveryNote {
  return { id: ctx.nextId, createdAt: ctx.at, updatedAt: ctx.at, batchId, status: input.status, returnedOn: input.status === 'returned' ? input.date : null, verifiedOn: input.status === 'verified' ? input.date : null, fileId: input.fileId ?? null, note: input.note ?? null, createdBy: ctx.by, voidedAt: null, voidedBy: null, voidReason: null };
}

function findRecord({ records, kind, recordId }: { readonly records: BatchRecords; readonly kind: 'shipment' | 'receipt' | 'delivery_note'; readonly recordId: string }): { readonly createdBy: string; readonly createdAt: string } {
  if (kind === 'delivery_note') {
    const note = records.deliveryNote;
    if (note === null || note.id !== recordId) throw missing(records);
    return note;
  }
  const rows = kind === 'shipment' ? records.shipments : records.receipts;
  const found = rows.find((row) => row.id === recordId);
  if (found === undefined) throw missing(records);
  return found;
}

function voidShipment(records: BatchRecords, input: { readonly recordId: string; readonly reason: string; readonly ctx: RuleContext }): BatchRecords {
  const record = records.shipments.find((row) => row.id === input.recordId);
  if (record === undefined) throw missing(records);
  assertCanVoid({ record, records, ctx: input.ctx });
  const voided = { ...record, voidedAt: input.ctx.at, voidedBy: input.ctx.by, voidReason: input.reason };
  return retie({ records, shipments: replace(records.shipments, voided), receipts: records.receipts, deliveryNote: records.deliveryNote, at: input.ctx.at });
}

function findReceipt(records: BatchRecords, recordId: string): Receipt {
  const record = records.receipts.find((row) => row.id === recordId);
  if (record === undefined) throw missing(records);
  return record;
}

function voidReceipt(records: BatchRecords, input: { readonly recordId: string; readonly reason: string; readonly ctx: RuleContext }): BatchRecords {
  const record = findReceipt(records, input.recordId);
  assertStandaloneReceipt(record);
  assertCanVoid({ record, records, ctx: input.ctx });
  return withVoidedReceipt(records, { record, ...input });
}

export function voidArrivalReceipt(records: BatchRecords, input: {
  readonly receiptId: string; readonly arrival: ArrivalReceiptLink;
  readonly reason: string; readonly ctx: RuleContext;
}): BatchRecords {
  const record = findReceipt(records, input.receiptId);
  const link = record.fulfillment?.arrival;
  if (link?.arrivalId !== input.arrival.arrivalId || link.revision !== input.arrival.revision || record.voidedAt !== null) throw missing(records);
  return withVoidedReceipt(records, { record, ...input });
}

function withVoidedReceipt(records: BatchRecords, { record, reason, ctx }: { readonly record: Receipt; readonly reason: string; readonly ctx: RuleContext }): BatchRecords {
  const voided = { ...record, voidedAt: ctx.at, voidedBy: ctx.by, voidReason: reason };
  return retie({ records, shipments: records.shipments, receipts: replace(records.receipts, voided), deliveryNote: records.deliveryNote, at: ctx.at });
}

function voidNote(records: BatchRecords, input: { readonly recordId: string; readonly reason: string; readonly ctx: RuleContext }): BatchRecords {
  const record = records.deliveryNote;
  if (record === null || record.id !== input.recordId) throw missing(records);
  assertCanVoid({ record, records, ctx: input.ctx });
  const voided = { ...record, voidedAt: input.ctx.at, voidedBy: input.ctx.by, voidReason: input.reason };
  return { ...records, deliveryNote: voided, batch: withStatus({ batch: records.batch, records, at: input.ctx.at }) };
}

function assertCanVoid({ record, records, ctx }: { readonly record: { readonly createdBy: string; readonly createdAt: string; readonly voidedAt: string | null }; readonly records: BatchRecords; readonly ctx: RuleContext }): void {
  if (record.createdBy !== ctx.by && !ctx.isAdmin) {
    throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '只有创建人或管理员可以作废', details: { state: records.batch.status } });
  }
  if (record.voidedAt !== null) throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '记录已经作废', details: { state: records.batch.status } });
  assertOutsideWindow(record.createdAt, ctx.at);
}

function missing(records: BatchRecords): DomainRuleViolation {
  return new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '记录不存在', details: { state: records.batch.status } });
}

function replace<T extends { readonly id: string }>(rows: readonly T[], next: T): readonly T[] {
  return rows.map((row) => (row.id === next.id ? next : row));
}
