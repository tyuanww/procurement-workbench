import type { ImportIssue } from '@sw/domain';
import { cellIssue, parsePoCell } from '@sw/domain';
import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { OwnerMapPayload, ParsedRow } from '../../../../application/src/ports/parsed-rows.js';
import { isHeader } from './detect.js';

const PO_COLUMN = 1;
const OWNER_COLUMN = 2;

export function readOwnerMap(sheet: SheetLike): ParsedRow<OwnerMapPayload>[] {
  const rows: ParsedRow<OwnerMapPayload>[] = [];
  for (let row = 1; row <= sheet.rowCount; row += 1) {
    const next = readRow(sheet, row);
    if (next !== null) rows.push(next);
  }
  return rows;
}

function readRow(sheet: SheetLike, row: number): ParsedRow<OwnerMapPayload> | null {
  if (isHeader(sheet, row)) return row === 1 ? null : skippedRow({ sheet, row, code: 'ROW_REPEATED_HEADER' });
  const poRaw = textOf({ sheet, row, column: PO_COLUMN });
  const ownerNameRaw = textOf({ sheet, row, column: OWNER_COLUMN });
  if (poRaw === '' && ownerNameRaw === '') return null;
  const issues = [...poIssues(poRaw), ...ownerIssues(ownerNameRaw)];
  const skipReason = errorCodeOf(issues);
  return {
    sheetName: sheet.name,
    rowNo: row,
    issues,
    action: skipReason === null ? null : 'skip',
    targetId: null,
    skipReason,
    payload: { poRaw, ownerNameRaw },
  };
}

function poIssues(poRaw: string): readonly ImportIssue[] {
  if (poRaw === '') return [cellIssue({ code: 'ROW_NO_IDENTITY', raw: null, column: '采购订单号' })];
  const parsed = parsePoCell(poRaw);
  const issues = parsed.issues.map((issue) => ({ ...issue, column: '采购订单号' }));
  if (parsed.value.poNorm === null) return [...issues, cellIssue({ code: 'ROW_NO_IDENTITY', raw: poRaw, column: '采购订单号' })];
  return issues;
}

function ownerIssues(ownerNameRaw: string): readonly ImportIssue[] {
  if (ownerNameRaw !== '') return [];
  return [cellIssue({ code: 'OWNER_NAME_MISSING', raw: null, column: '负责人' })];
}

function errorCodeOf(issues: readonly ImportIssue[]): string | null {
  const error = issues.find((issue) => issue.severity === 'error');
  return error === undefined ? null : error.code;
}

function skippedRow(input: { readonly sheet: SheetLike; readonly row: number; readonly code: 'ROW_REPEATED_HEADER' }): ParsedRow<OwnerMapPayload> {
  return {
    sheetName: input.sheet.name,
    rowNo: input.row,
    issues: [cellIssue({ code: input.code, raw: null })],
    action: 'skip',
    targetId: null,
    skipReason: input.code,
    payload: { poRaw: '', ownerNameRaw: '' },
  };
}

function textOf(input: { readonly sheet: SheetLike; readonly row: number; readonly column: number }): string {
  return input.sheet.cell(input.row, input.column)?.text.trim() ?? '';
}
