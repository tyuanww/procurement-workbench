import { CONFIRMED_ARRIVAL_COLUMNS, UNCONFIRMED_ARRIVAL, cellIssue, isNotProvided, parseDeliveryBatchId, parseLocalDate, type DeliveryBatch, type DeliveryBatchId, type ImportRow, type LocalDate } from '@sw/domain';
import type { ConfirmedArrivalParsed } from '../ports/parsed-rows.js';
import type { UnitOfWorkStores } from '../ports/unit-of-work.js';

type Confirmation = {
  readonly batchId: DeliveryBatchId;
  readonly exportedDate: LocalDate | null;
  readonly exportedReceiverPartyId: string;
  readonly exportedLineId: string;
  readonly sequence: string;
  readonly date: LocalDate;
  readonly reason: string | null;
};

type ConfirmationDecision = 'update' | 'unchanged'
  | 'ARRIVAL_BATCH_NOT_FOUND'
  | 'ARRIVAL_BATCH_NOT_EDITABLE'
  | 'ARRIVAL_BATCH_RECEIVER_CHANGED'
  | 'ARRIVAL_BATCH_IDENTITY_CHANGED'
  | 'ARRIVAL_CONFIRM_DATE_CHANGED'
  | 'ARRIVAL_CONFIRM_DATE_REASON_MISSING';

export async function previewConfirmedArrivals(tx: UnitOfWorkStores, parsed: ConfirmedArrivalParsed): Promise<ConfirmedArrivalParsed> {
  const rows = await Promise.all(parsed.rows.map(async (row) => {
    if (row.action !== 'update') return row;
    const confirmation = confirmationOf(row.payload);
    if (confirmation === null) throw new Error('已解析的确认日行缺少批次或日期');
    const decision = confirmationDecision(await tx.batches.find(confirmation.batchId), confirmation);
    if (decision === 'update' || decision === 'unchanged') return { ...row, action: decision };
    const issue = cellIssue({ code: decision, column: CONFIRMED_ARRIVAL_COLUMNS.date, raw: row.payload.date.raw });
    return { ...row, action: 'conflict' as const, issues: [...row.issues, issue] };
  }));
  return { ...parsed, rows };
}

export function confirmationDecision(batch: DeliveryBatch | undefined, confirmation: Confirmation): ConfirmationDecision {
  if (batch === undefined) return 'ARRIVAL_BATCH_NOT_FOUND';
  if (batch.orderLineId !== confirmation.exportedLineId || String(batch.seq) !== confirmation.sequence) return 'ARRIVAL_BATCH_IDENTITY_CHANGED';
  if (batch.dateBuyerConfirmed === confirmation.date) return 'unchanged';
  return dateUpdateDecision(batch, confirmation);
}

function dateUpdateDecision(batch: DeliveryBatch, confirmation: Confirmation): ConfirmationDecision {
  if (batch.closedAt !== null || batch.cancelledAt !== null) return 'ARRIVAL_BATCH_NOT_EDITABLE';
  if (batch.receiverPartyId !== confirmation.exportedReceiverPartyId) return 'ARRIVAL_BATCH_RECEIVER_CHANGED';
  if (batch.dateBuyerConfirmed !== confirmation.exportedDate) return 'ARRIVAL_CONFIRM_DATE_CHANGED';
  if (batch.firstConfirmedDate !== null && (confirmation.reason === null || isNotProvided(confirmation.reason))) {
    return 'ARRIVAL_CONFIRM_DATE_REASON_MISSING';
  }
  return 'update';
}

export function confirmationOf(payload: ImportRow['parsed']): Confirmation | null {
  if (!isRecord(payload) || typeof payload.batchId !== 'string') return null;
  const batchId = parseDeliveryBatchId(payload.batchId);
  const date = dayOf(payload.date);
  const snapshot = snapshotOf(payload);
  if (!batchId.ok || date === null || snapshot === null) return null;
  return { batchId: batchId.value, ...snapshot, date, reason: typeof payload.reason === 'string' ? payload.reason : null };
}

function snapshotOf(payload: Record<string, unknown>) {
  const { exportedLineId, exportedReceiverPartyId, sequence, exportedDate: cell } = payload;
  if (!isPresent(exportedLineId) || !isPresent(exportedReceiverPartyId) || !isPresent(sequence) || !isRecord(cell)) return null;
  const exportedDate = dayOf(cell);
  if (exportedDate === null && cell.raw !== UNCONFIRMED_ARRIVAL) return null;
  return { exportedDate, exportedReceiverPartyId, exportedLineId, sequence };
}

function dayOf(cell: unknown): LocalDate | null {
  if (!isRecord(cell) || typeof cell.value !== 'string') return null;
  const value = parseLocalDate(cell.value);
  return value.ok ? value.value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}
