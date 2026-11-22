import { createHash } from 'node:crypto';
import type { PlannerSheetPayload } from '../../../../application/src/imports/commit/planner-sheet-v1.js';
import type { ParsedImport } from '../../../../application/src/ports/parsed-rows.js';
import type { ImportFingerprint } from '../../../../application/src/ports/import-template.js';

export function plannerIdentity(parsed: ParsedImport): readonly ImportFingerprint[] {
  if (parsed.template !== 'planner-sheet-v1') return [];
  return parsed.rows.map((row) => ({ sheet: row.sheetName, rowNo: row.rowNo, fingerprint: contentKey(row) }));
}

export function plannerContentKey(row: { readonly sheetName: string; readonly rowNo: number; readonly payload: PlannerSheetPayload }): string {
  return createHash('sha1').update(contentFields(row).join('\u001f')).digest('hex');
}

function contentKey(row: { readonly sheetName: string; readonly rowNo: number; readonly payload: unknown }): string {
  if (!isPlannerPayload(row.payload)) return `${row.sheetName}:${row.rowNo}`;
  return plannerContentKey({ sheetName: row.sheetName, rowNo: row.rowNo, payload: row.payload });
}

function contentFields(row: { readonly sheetName: string; readonly rowNo: number; readonly payload: PlannerSheetPayload }): readonly string[] {
  return [
    row.sheetName,
    String(row.rowNo),
    row.payload.scheduledOn.value ?? '',
    row.payload.scheduledOn.raw ?? '',
    row.payload.poRaw,
    row.payload.poNorm ?? '',
    row.payload.nameRaw,
    row.payload.orderItemCodeRaw,
    String(row.payload.qtyRequired.value ?? ''),
    row.payload.qtyRequired.raw ?? '',
    row.payload.packagingComboRaw,
    row.payload.productionItemCodeRaw,
    row.payload.materialPoRaw,
    row.payload.noteRaw,
  ];
}

function isPlannerPayload(value: unknown): value is PlannerSheetPayload {
  if (!isRecord(value) || !isRecord(value.scheduledOn) || !isRecord(value.qtyRequired)) return false;
  return typeof value.poRaw === 'string' && typeof value.nameRaw === 'string' && typeof value.orderItemCodeRaw === 'string' && typeof value.productionItemCodeRaw === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
