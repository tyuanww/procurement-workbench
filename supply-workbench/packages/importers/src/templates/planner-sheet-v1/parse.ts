import { cellIssue, DEFAULT_SETTINGS, isNotProvided, parsePoCell, type ImportIssue } from '@sw/domain';
import type { CellLike, SheetLike, WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import type { ImportParseContext, ParsedRow } from '../../../../application/src/ports/parsed-rows.js';
import type { PlannerSheetPayload } from '../../../../application/src/imports/commit/planner-sheet-v1.js';
import { parseDate } from '../../normalize/date.js';
import { parseQty } from '../../normalize/qty.js';
import { compactHeader, headerOf, type PlannerHeader } from './columns.js';

export type PlannerSheetParsed = {
  readonly template: 'planner-sheet-v1';
  readonly coverage: 'full_snapshot';
  readonly candidateKeyVersion: 'planner-sheet-v1';
  readonly rows: readonly ParsedRow<PlannerSheetPayload>[];
};

export function parsePlannerSheet(book: WorkbookLike, ctx: ImportParseContext): PlannerSheetParsed {
  const sheet = book.sheets.find((item) => headerOf(item) !== null);
  if (sheet === undefined) return { ...emptyParsed(), rows: [headerMissing(book.sheets[0]?.name ?? '排产作业表')] };
  const header = headerOf(sheet);
  if (header === null) return emptyParsed();
  return { ...emptyParsed(), rows: readRows({ sheet, header, book, ctx }) };
}

function readRows(input: { readonly sheet: SheetLike; readonly header: PlannerHeader; readonly book: WorkbookLike; readonly ctx: ImportParseContext }): ParsedRow<PlannerSheetPayload>[] {
  const rows: ParsedRow<PlannerSheetPayload>[] = [];
  const seen = new Set<string>();
  for (let row = input.header.lastHeaderRow + 1; row <= input.sheet.rowCount; row += 1) {
    const next = readRow({ ...input, row, seen });
    if (next !== null) rows.push(next);
  }
  return rows;
}

function readRow(input: {
  readonly sheet: SheetLike;
  readonly header: PlannerHeader;
  readonly book: WorkbookLike;
  readonly ctx: ImportParseContext;
  readonly row: number;
  readonly seen: Set<string>;
}): ParsedRow<PlannerSheetPayload> | null {
  if (isRepeatedHeader({ sheet: input.sheet, header: input.header, row: input.row })) return skipped({ sheet: input.sheet, row: input.row, code: 'ROW_REPEATED_HEADER' });
  const built = buildRow(input);
  if (built === null) return null;
  const issues = input.seen.has(built.key) ? [...built.issues, cellIssue({ code: 'KEY_DUPLICATE_IN_FILE', raw: built.key, column: '订单号' })] : built.issues;
  input.seen.add(built.key);
  const skipReason = errorCodeOf(issues);
  return {
    sheetName: input.sheet.name,
    rowNo: input.row,
    issues,
    action: skipReason === null ? null : 'skip',
    targetId: null,
    skipReason,
    payload: built.payload,
  };
}

function buildRow(input: {
  readonly sheet: SheetLike;
  readonly header: PlannerHeader;
  readonly book: WorkbookLike;
  readonly ctx: ImportParseContext;
  readonly row: number;
}): { readonly payload: PlannerSheetPayload; readonly issues: ImportIssue[]; readonly key: string } | null {
  const range = input.ctx.dateSanityRange ?? DEFAULT_SETTINGS.dateSanityRange;
  const scheduled = parseDate(cellAt({ sheet: input.sheet, row: input.row, col: input.header.dateCol }), { date1904: input.book.date1904, dateSanityRange: range });
  const qty = parseQty(cellAt({ sheet: input.sheet, row: input.row, col: input.header.qtyCol }));
  const poRaw = textAt({ sheet: input.sheet, row: input.row, col: input.header.poCol });
  const nameRaw = textAt({ sheet: input.sheet, row: input.row, col: input.header.nameCol });
  const orderItemCodeRaw = textAt({ sheet: input.sheet, row: input.row, col: input.header.orderItemCol });
  const packagingComboRaw = textAt({ sheet: input.sheet, row: input.row, col: input.header.comboCol });
  const productionItemCodeRaw = textAt({ sheet: input.sheet, row: input.row, col: input.header.productionItemCol });
  const materialPoRaw = textAt({ sheet: input.sheet, row: input.row, col: input.header.materialPoCol });
  const noteRaw = textAt({ sheet: input.sheet, row: input.row, col: input.header.noteCol });
  const po = parsePoCell(poRaw);
  if (isBlank({ scheduledRaw: scheduled.raw, qtyRaw: qty.raw, poRaw, nameRaw, orderItemCodeRaw, packagingComboRaw, productionItemCodeRaw, materialPoRaw, noteRaw })) return null;
  const issues = rowIssues({ sheet: input.sheet, header: input.header, row: input.row, scheduled: scheduled.issues, qty: qty.issues, po: po.issues, poRaw, nameRaw, orderItemCodeRaw, productionItemCodeRaw });
  const payload: PlannerSheetPayload = {
    scheduledOn: { raw: scheduled.raw, value: scheduled.value },
    poRaw,
    poNorm: po.value.poNorm,
    nameRaw,
    orderItemCodeRaw,
    qtyRequired: { raw: qty.raw, value: qty.value },
    packagingComboRaw,
    productionItemCodeRaw,
    materialPoRaw,
    noteRaw,
  };
  return { payload, issues, key: [scheduled.value ?? scheduled.raw, po.value.poNorm ?? poRaw, nameRaw, orderItemCodeRaw, productionItemCodeRaw].join('\u001f') };
}

function rowIssues(input: {
  readonly sheet: SheetLike;
  readonly header: PlannerHeader;
  readonly row: number;
  readonly scheduled: readonly ImportIssue[];
  readonly qty: readonly ImportIssue[];
  readonly po: readonly ImportIssue[];
  readonly poRaw: string;
  readonly nameRaw: string;
  readonly orderItemCodeRaw: string;
  readonly productionItemCodeRaw: string;
}): ImportIssue[] {
  return [
    ...withColumn(input.scheduled, '排产日期'),
    ...mergedIssues({ sheet: input.sheet, row: input.row, col: input.header.dateCol, column: '排产日期' }),
    ...withColumn(input.qty, '要求排产'),
    ...mergedIssues({ sheet: input.sheet, row: input.row, col: input.header.qtyCol, column: '要求排产' }),
    ...withColumn(input.po, '订单号'),
    ...mergedIssues({ sheet: input.sheet, row: input.row, col: input.header.poCol, column: '订单号' }),
    ...mergedIssues({ sheet: input.sheet, row: input.row, col: input.header.nameCol, column: '品名' }),
    ...formulaIssues({ sheet: input.sheet, row: input.row, col: input.header.nameCol, column: '品名' }),
    ...mergedIssues({ sheet: input.sheet, row: input.row, col: input.header.orderItemCol, column: '下单品号' }),
    ...formulaIssues({ sheet: input.sheet, row: input.row, col: input.header.orderItemCol, column: '下单品号' }),
    ...mergedIssues({ sheet: input.sheet, row: input.row, col: input.header.comboCol, column: '包材组合' }),
    ...formulaIssues({ sheet: input.sheet, row: input.row, col: input.header.comboCol, column: '包材组合' }),
    ...mergedIssues({ sheet: input.sheet, row: input.row, col: input.header.productionItemCol, column: '生产品号' }),
    ...formulaIssues({ sheet: input.sheet, row: input.row, col: input.header.productionItemCol, column: '生产品号' }),
    ...mergedIssues({ sheet: input.sheet, row: input.row, col: input.header.materialPoCol, column: '采购单号' }),
    ...formulaIssues({ sheet: input.sheet, row: input.row, col: input.header.materialPoCol, column: '采购单号' }),
    ...mergedIssues({ sheet: input.sheet, row: input.row, col: input.header.noteCol, column: '备注' }),
    ...formulaIssues({ sheet: input.sheet, row: input.row, col: input.header.noteCol, column: '备注' }),
    ...identityIssues(input),
  ];
}

function identityIssues(input: { readonly poRaw: string; readonly nameRaw: string; readonly orderItemCodeRaw: string; readonly productionItemCodeRaw: string }): readonly ImportIssue[] {
  if (present(input.poRaw) || present(input.nameRaw) || present(input.orderItemCodeRaw) || present(input.productionItemCodeRaw)) return [];
  return [cellIssue({ code: 'ROW_NO_IDENTITY', raw: null, column: '订单号' })];
}

function isRepeatedHeader(input: { readonly sheet: SheetLike; readonly header: PlannerHeader; readonly row: number }): boolean {
  return compactHeader(textAt({ sheet: input.sheet, row: input.row, col: input.header.poCol })) === '订单号';
}

function isBlank(input: { readonly scheduledRaw: string; readonly qtyRaw: string; readonly poRaw: string; readonly nameRaw: string; readonly orderItemCodeRaw: string; readonly packagingComboRaw: string; readonly productionItemCodeRaw: string; readonly materialPoRaw: string; readonly noteRaw: string }): boolean {
  return !present(input.scheduledRaw) && !present(input.qtyRaw) && !present(input.poRaw) && !present(input.nameRaw) && !present(input.orderItemCodeRaw) && !present(input.packagingComboRaw) && !present(input.productionItemCodeRaw) && !present(input.materialPoRaw) && !present(input.noteRaw);
}

function present(text: string): boolean {
  return !isNotProvided(text);
}

function skipped(input: { readonly sheet: SheetLike; readonly row: number; readonly code: 'ROW_REPEATED_HEADER' | 'HEADER_NOT_FOUND' }): ParsedRow<PlannerSheetPayload> {
  return {
    sheetName: input.sheet.name,
    rowNo: input.row,
    issues: [cellIssue({ code: input.code, raw: null })],
    action: 'skip',
    targetId: null,
    skipReason: input.code,
    payload: emptyPayload(),
  };
}

function headerMissing(sheetName: string): ParsedRow<PlannerSheetPayload> {
  return {
    sheetName,
    rowNo: 1,
    issues: [cellIssue({ code: 'HEADER_NOT_FOUND', raw: null })],
    action: 'skip',
    targetId: null,
    skipReason: 'HEADER_NOT_FOUND',
    payload: emptyPayload(),
  };
}

function emptyParsed(): PlannerSheetParsed {
  return { template: 'planner-sheet-v1', coverage: 'full_snapshot', candidateKeyVersion: 'planner-sheet-v1', rows: [] };
}

function emptyPayload(): PlannerSheetPayload {
  return {
    scheduledOn: { raw: '', value: null },
    poRaw: '',
    poNorm: null,
    nameRaw: '',
    orderItemCodeRaw: '',
    qtyRequired: { raw: '', value: null },
    packagingComboRaw: '',
    productionItemCodeRaw: '',
    materialPoRaw: '',
    noteRaw: '',
  };
}

function mergedIssues(input: { readonly sheet: SheetLike; readonly row: number; readonly col: number; readonly column: string }): ImportIssue[] {
  const cell = input.sheet.cell(input.row, input.col);
  if (cell?.mergedFrom === undefined) return [];
  return [cellIssue({ code: 'MERGED_FILL', raw: cell.text, column: input.column })];
}

function formulaIssues(input: { readonly sheet: SheetLike; readonly row: number; readonly col: number; readonly column: string }): ImportIssue[] {
  const cell = input.sheet.cell(input.row, input.col);
  if (cell?.formula === undefined) return [];
  return [cellIssue({ code: 'FORMULA_VALUE', raw: cell.text, column: input.column })];
}

function withColumn(issues: readonly ImportIssue[], column: string): ImportIssue[] {
  return issues.map((issue) => ({ ...issue, column }));
}

function errorCodeOf(issues: readonly ImportIssue[]): string | null {
  const error = issues.find((issue) => issue.severity === 'error');
  return error === undefined ? null : error.code;
}

function cellAt(input: { readonly sheet: SheetLike; readonly row: number; readonly col: number }): CellLike {
  return input.sheet.cell(input.row, input.col) ?? { kind: 'empty', value: null, text: '' };
}

function textAt(input: { readonly sheet: SheetLike; readonly row: number; readonly col: number }): string {
  return cellAt(input).text.trim();
}
