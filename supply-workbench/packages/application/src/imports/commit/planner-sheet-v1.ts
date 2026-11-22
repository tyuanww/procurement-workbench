import { isLocalDate, type LocalDate } from '@sw/domain';
import type { ParsedCell } from '../../ports/parsed-rows.js';
import type { CommitContext, CommitResult } from './context.js';

export type PlannerSheetPayload = {
  readonly scheduledOn: ParsedCell<LocalDate>;
  readonly poRaw: string;
  readonly poNorm: string | null;
  readonly nameRaw: string;
  readonly orderItemCodeRaw: string;
  readonly qtyRequired: ParsedCell<number>;
  readonly packagingComboRaw: string;
  readonly productionItemCodeRaw: string;
  readonly materialPoRaw: string;
  readonly noteRaw: string;
};

export async function commitPlannerSheet(ctx: CommitContext): Promise<CommitResult> {
  for (const row of ctx.rows) {
    if (row.action === 'skip') continue;
    if (!isPlannerPayload(row.parsed)) throw new Error('排产作业表行无法读取');
  }
  return { affectedLineIds: [], presentLineIds: [] };
}

const TEXT_KEYS = ['poRaw', 'nameRaw', 'orderItemCodeRaw', 'packagingComboRaw', 'productionItemCodeRaw', 'materialPoRaw', 'noteRaw'] as const;

function isPlannerPayload(value: unknown): value is PlannerSheetPayload {
  if (!isRecord(value)) return false;
  return isDateCell(value.scheduledOn) && isQtyCell(value.qtyRequired) && isTextOrNull(value.poNorm) && TEXT_KEYS.every((key) => isText(value[key]));
}

function isDateCell(value: unknown): value is ParsedCell<LocalDate> {
  return isCell(value, isDateValue);
}

function isQtyCell(value: unknown): value is ParsedCell<number> {
  return isCell(value, isQtyValue);
}

function isCell(value: unknown, valueOk: (item: unknown) => boolean): boolean {
  return isRecord(value) && isTextOrNull(value.raw) && valueOk(value.value);
}

function isDateValue(value: unknown): value is LocalDate | null {
  return value === null || (typeof value === 'string' && isLocalDate(value));
}

function isQtyValue(value: unknown): boolean {
  return value === null || typeof value === 'number';
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
