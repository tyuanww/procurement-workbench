import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { BomPayload, ParsedRow } from '../../../../application/src/ports/parsed-rows.js';
import { cellIssue, parseItemCode, type ImportIssue } from '@sw/domain';
import { parseQty } from '../../normalize/qty.js';
import { isHeader } from './detect.js';

const PRODUCT_BARCODE = 1;
const PRODUCT_NAME = 2;
const REORDER = 3;
const CUMULATIVE = 4;
const PART_CODE = 5;
const PART_NAME = 6;

export function readBom(sheet: SheetLike): ParsedRow<BomPayload>[] {
  const rows: ParsedRow<BomPayload>[] = [];
  let isFirst = true;
  let hasStarted = false;
  for (let row = 1; row <= sheet.rowCount; row += 1) {
    const next = readRow({ sheet, row, isFirst, hasStarted });
    if (next.kind === 'header') {
      hasStarted = true;
      isFirst = true;
      if (next.row !== null) rows.push(next.row);
      continue;
    }
    if (next.row === null) continue;
    rows.push(next.row);
    isFirst = false;
  }
  if (!hasStarted) return [headerMissing(sheet)];
  return rows;
}

function headerMissing(sheet: SheetLike): ParsedRow<BomPayload> {
  return { sheetName: sheet.name, rowNo: 1, issues: [cellIssue({ code: 'HEADER_NOT_FOUND', raw: null })], action: 'skip', targetId: null, skipReason: 'HEADER_NOT_FOUND', payload: emptyPayload() };
}

function readRow(input: { readonly sheet: SheetLike; readonly row: number; readonly isFirst: boolean; readonly hasStarted: boolean }): { readonly kind: 'header' | 'data'; readonly row: ParsedRow<BomPayload> | null } {
  if (isHeader(input.sheet, input.row)) return { kind: 'header', row: input.row === 1 ? null : repeatedHeader(input.sheet, input.row) };
  if (!input.hasStarted || isBlank(input.sheet, input.row)) return { kind: 'data', row: null };
  return { kind: 'data', row: dataRow({ sheet: input.sheet, row: input.row, isFirst: input.isFirst }) };
}

function repeatedHeader(sheet: SheetLike, row: number): ParsedRow<BomPayload> {
  return { sheetName: sheet.name, rowNo: row, issues: [cellIssue({ code: 'ROW_REPEATED_HEADER', raw: null })], action: 'skip', targetId: null, skipReason: 'ROW_REPEATED_HEADER', payload: emptyPayload() };
}

function dataRow({ sheet, row, isFirst }: { readonly sheet: SheetLike; readonly row: number; readonly isFirst: boolean }): ParsedRow<BomPayload> {
  const isMergedFill = !isFirst && hasMergedQty(sheet, row);
  const part = partCode(sheet, row);
  return {
    sheetName: sheet.name,
    rowNo: row,
    issues: [...mergedIssues({ sheet, row, isMergedFill }), ...part.issues],
    action: null,
    targetId: null,
    skipReason: null,
    payload: payloadOf({ sheet, row, code: part.code, isMergedFill }),
  };
}

function payloadOf(input: { readonly sheet: SheetLike; readonly row: number; readonly code: string; readonly isMergedFill: boolean }): BomPayload {
  return {
    productBarcodeRaw: text({ sheet: input.sheet, row: input.row, col: PRODUCT_BARCODE }),
    productName: text({ sheet: input.sheet, row: input.row, col: PRODUCT_NAME }),
    reorderCount: qty({ sheet: input.sheet, row: input.row, col: REORDER }),
    cumulativeQty: qty({ sheet: input.sheet, row: input.row, col: CUMULATIVE }),
    partCodeRaw: input.code,
    partName: text({ sheet: input.sheet, row: input.row, col: PART_NAME }),
    mergedFill: input.isMergedFill,
  };
}

function mergedIssues({ sheet, row, isMergedFill }: { readonly sheet: SheetLike; readonly row: number; readonly isMergedFill: boolean }): ImportIssue[] {
  if (!isMergedFill) return [];
  return [cellIssue({ code: 'MERGED_FILL', raw: sheet.cell(row, REORDER)?.text ?? null, column: '成品翻单次数' })];
}

function partCode(sheet: SheetLike, row: number): { readonly code: string; readonly issues: ImportIssue[] } {
  const raw = sheet.cell(row, PART_CODE)?.text ?? '';
  if (raw.trim() === '') return { code: '', issues: [] };
  const parsed = parseItemCode(raw, { isBomPartColumn: true });
  return { code: parsed.value?.codeNorm ?? raw.trim(), issues: parsed.issues.map((issue) => ({ ...issue, column: '子件条码' })) };
}

function hasMergedQty(sheet: SheetLike, row: number): boolean {
  return sheet.cell(row, REORDER)?.mergedFrom !== undefined || sheet.cell(row, CUMULATIVE)?.mergedFrom !== undefined;
}

function isBlank(sheet: SheetLike, row: number): boolean {
  return text({ sheet, row, col: PRODUCT_BARCODE }) === '' && text({ sheet, row, col: PART_CODE }) === '' && text({ sheet, row, col: PRODUCT_NAME }) === '';
}

function text({ sheet, row, col }: { readonly sheet: SheetLike; readonly row: number; readonly col: number }): string {
  return sheet.cell(row, col)?.text.trim() ?? '';
}

function qty({ sheet, row, col }: { readonly sheet: SheetLike; readonly row: number; readonly col: number }): number | null {
  const cell = sheet.cell(row, col);
  if (cell === null) return null;
  return parseQty(cell).value;
}

function emptyPayload(): BomPayload {
  return { productBarcodeRaw: '', productName: '', reorderCount: null, cumulativeQty: null, partCodeRaw: '', partName: '', mergedFill: false };
}
