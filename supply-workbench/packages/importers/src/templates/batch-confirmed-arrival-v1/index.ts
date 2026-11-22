import { CONFIRMED_ARRIVAL_COLUMNS, CONFIRMED_ARRIVAL_SHEET, UNCONFIRMED_ARRIVAL, cellIssue, localDate, type ImportIssue } from '@sw/domain';
import { commitConfirmedArrival } from '../../../../application/src/imports/commit/batch-confirmed-arrival-v1.js';
import type { ImportTemplate } from '../../../../application/src/ports/import-template.js';
import type { ConfirmedArrivalParsed, ConfirmedArrivalPayload, ParsedRow } from '../../../../application/src/ports/parsed-rows.js';
import type { CellLike, SheetLike, WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { parseDate, type DateParseOptions } from '../../normalize/date.js';
import { knownManifest } from '../manifest.js';
import { plainIdentity } from '../plain.js';

const HEADERS = Object.values(CONFIRMED_ARRIVAL_COLUMNS);
const DATE_RANGE = { from: localDate('0001-01-01'), to: localDate('9999-12-31') };

type Row = ParsedRow<ConfirmedArrivalPayload>;

const template: ImportTemplate<ConfirmedArrivalParsed> = {
  ...plainIdentity,
  id: 'batch-confirmed-arrival-v1',
  detect(book) {
    return sheetOf(book) === undefined
      ? { score: 0, reasons: [] }
      : { score: 100, reasons: ['表名和列名与工作台导出的批次表一致'] };
  },
  parse(book) {
    const sheet = sheetOf(book);
    return {
      template: 'batch-confirmed-arrival-v1',
      rows: sheet === undefined ? [headerError(book)] : readRows(sheet, { date1904: book.date1904, dateSanityRange: DATE_RANGE }),
    };
  },
  diff(parsed) {
    return { ...parsed, rows: resolveDuplicates(parsed.rows) };
  },
};

export const manifest = knownManifest({ template, columns: HEADERS, commit: commitConfirmedArrival });

function sheetOf(book: WorkbookLike): SheetLike | undefined {
  return book.sheets.find((sheet) => sheet.name === CONFIRMED_ARRIVAL_SHEET
    && HEADERS.every((name, index) => sheet.cell(1, index + 1)?.text.trim() === name));
}

function headerError(book: WorkbookLike): Row {
  return {
    sheetName: book.sheets[0]?.name ?? CONFIRMED_ARRIVAL_SHEET,
    rowNo: 1,
    issues: [cellIssue({ code: 'HEADER_NOT_FOUND', raw: null })],
    action: 'skip',
    skipReason: 'HEADER_NOT_FOUND',
    targetId: null,
    payload: {
      batchId: '', po: null, name: null, sequence: null, warehouse: null,
      exportedDate: { raw: null, value: null }, exportedReceiverPartyId: null, exportedLineId: null,
      date: { raw: null, value: null }, reason: null,
    },
  };
}

function readRows(sheet: SheetLike, options: DateParseOptions): Row[] {
  const rows: Row[] = [];
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo += 1) rows.push(readRow({ sheet, rowNo, options }));
  return rows;
}

function readRow({ sheet, rowNo, options }: { readonly sheet: SheetLike; readonly rowNo: number; readonly options: DateParseOptions }): Row {
  const at = (key: keyof typeof CONFIRMED_ARRIVAL_COLUMNS) => sheet.cell(rowNo, HEADERS.indexOf(CONFIRMED_ARRIVAL_COLUMNS[key]) + 1);
  const dateCell = at('date');
  const exportedCell = at('exportedDate');
  const parsedDate = dateOf(dateCell, options);
  const payload: ConfirmedArrivalPayload = {
    batchId: textOf(at('batchId')) ?? '',
    po: textOf(at('po')),
    name: textOf(at('name')),
    sequence: textOf(at('sequence')),
    warehouse: textOf(at('warehouse')),
    exportedDate: dateOf(exportedCell, options).cell,
    exportedReceiverPartyId: textOf(at('exportedReceiverPartyId')),
    exportedLineId: textOf(at('exportedLineId')),
    date: parsedDate.cell,
    reason: textOf(at('reason')),
  };
  const row = { sheetName: sheet.name, rowNo, targetId: null, payload };
  if (payload.date.raw === null) return { ...row, action: 'skip', skipReason: '确认日为空', issues: [] };
  const issues = rowIssues(payload, parsedDate.issues);
  const hasError = payload.batchId === '' || payload.date.value === null || payload.exportedReceiverPartyId === null
    || payload.exportedLineId === null || payload.sequence === null
    || (payload.exportedDate.value === null && payload.exportedDate.raw !== UNCONFIRMED_ARRIVAL);
  return { ...row, action: hasError ? 'conflict' : 'update', skipReason: null, issues };
}

function dateOf(cell: CellLike | null, options: DateParseOptions) {
  const raw = textOf(cell);
  if (cell === null || raw === null || raw === UNCONFIRMED_ARRIVAL) return { cell: { raw, value: null }, issues: [] };
  const parsed = parseDate(cell, options);
  return { cell: { raw, value: parsed.value }, issues: parsed.issues };
}

function textOf(cell: CellLike | null): string | null {
  const text = cell?.text.trim() ?? '';
  return text === '' ? null : text;
}

function rowIssues(payload: ConfirmedArrivalPayload, dates: readonly ImportIssue[]): ImportIssue[] {
  const issues: ImportIssue[] = dates.map((issue) => ({ ...issue, column: CONFIRMED_ARRIVAL_COLUMNS.date }));
  if (payload.batchId === '') issues.push(cellIssue({ code: 'ARRIVAL_BATCH_ID_MISSING', raw: null, column: CONFIRMED_ARRIVAL_COLUMNS.batchId }));
  if (payload.date.value === null && dates.length === 0) {
    issues.push(cellIssue({ code: 'DATE_INVALID', raw: payload.date.raw, column: CONFIRMED_ARRIVAL_COLUMNS.date }));
  }
  if (payload.exportedDate.value === null && payload.exportedDate.raw !== UNCONFIRMED_ARRIVAL) {
    issues.push(cellIssue({ code: 'ARRIVAL_EXPORTED_DATE_INVALID', raw: payload.exportedDate.raw, column: CONFIRMED_ARRIVAL_COLUMNS.exportedDate }));
  }
  if (payload.exportedReceiverPartyId === null) {
    issues.push(cellIssue({ code: 'ARRIVAL_EXPORTED_RECEIVER_MISSING', raw: null, column: CONFIRMED_ARRIVAL_COLUMNS.exportedReceiverPartyId }));
  }
  if (payload.exportedLineId === null || payload.sequence === null) {
    const column = payload.exportedLineId === null ? CONFIRMED_ARRIVAL_COLUMNS.exportedLineId : CONFIRMED_ARRIVAL_COLUMNS.sequence;
    issues.push(cellIssue({ code: 'ARRIVAL_EXPORTED_BATCH_IDENTITY_MISSING', raw: null, column }));
  }
  return issues;
}

function resolveDuplicates(rows: readonly Row[]): Row[] {
  const datesByBatch = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.action !== 'update' || row.payload.date.value === null) continue;
    const dates = datesByBatch.get(row.payload.batchId) ?? new Set<string>();
    dates.add(row.payload.date.value);
    datesByBatch.set(row.payload.batchId, dates);
  }
  const seen = new Set<string>();
  return rows.map((row) => duplicateAction({ row, dates: datesByBatch.get(row.payload.batchId), seen }));
}

function duplicateAction({ row, dates, seen }: { readonly row: Row; readonly dates: ReadonlySet<string> | undefined; readonly seen: Set<string> }): Row {
  if (row.action !== 'update' || dates === undefined) return row;
  if (dates.size > 1) {
    const duplicate = cellIssue({ code: 'ARRIVAL_CONFIRM_DATE_DUPLICATE', column: CONFIRMED_ARRIVAL_COLUMNS.date, raw: row.payload.date.raw });
    return { ...row, action: 'conflict', issues: [...row.issues, duplicate] };
  }
  const { batchId, exportedLineId, sequence, exportedReceiverPartyId, exportedDate } = row.payload;
  const key = JSON.stringify([batchId, exportedLineId, sequence, exportedReceiverPartyId, exportedDate.value]);
  if (seen.has(key)) return { ...row, action: 'skip', skipReason: '批次和确认日重复' };
  seen.add(key);
  return row;
}
