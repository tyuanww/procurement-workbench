import type { LocalDate } from '@sw/domain';
import * as XLSX from 'xlsx';
import type { SheetCell, SpreadsheetWriter } from '../../../application/src/ports/spreadsheet-writer.js';

const MISSING = '缺失，不是 0';
const DATE_FORMAT = 'yyyy-mm-dd';
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;
const EXCEL_LEAP_CUTOFF = 60;

export function spreadsheetWriter(): SpreadsheetWriter {
  return { write };
}

export function write(input: { readonly sheets: readonly { readonly name: string; readonly rows: readonly (readonly SheetCell[])[] }[] }): Uint8Array {
  const book = XLSX.utils.book_new();
  for (const sheet of input.sheets) XLSX.utils.book_append_sheet(book, sheetOf(sheet.rows), sheet.name);
  return toBytes(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
}

function sheetOf(rows: readonly (readonly SheetCell[])[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => row.map(aoaValue)));
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => applyCell({ sheet, cell, ref: XLSX.utils.encode_cell({ r: rowIndex, c: colIndex }) }));
  });
  return sheet;
}

function aoaValue(cell: SheetCell): string | number | null {
  if (isDateCell(cell)) return null;
  return cell;
}

function applyCell(input: { readonly sheet: XLSX.WorkSheet; readonly cell: SheetCell; readonly ref: string }): void {
  if (isDateCell(input.cell)) {
    input.sheet[input.ref] = { t: 'n', v: excelSerial(input.cell.day), z: DATE_FORMAT };
    return;
  }
  if (input.cell !== null) return;
  const existing = input.sheet[input.ref] ?? { t: 's', v: '' };
  input.sheet[input.ref] = { ...existing, t: 's', v: '', c: [{ a: '工作台', t: MISSING }] };
}

function excelSerial(day: string): number {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const year = matched?.[1];
  const month = matched?.[2];
  const date = matched?.[3];
  if (year === undefined || month === undefined || date === undefined) throw new Error('日期没有写成表格');
  const serial = (Date.UTC(Number(year), Number(month) - 1, Number(date)) - EXCEL_EPOCH) / DAY_MS;
  if (!Number.isInteger(serial)) throw new Error('日期没有写成表格');
  return serial < EXCEL_LEAP_CUTOFF ? serial - 1 : serial;
}

function isDateCell(cell: SheetCell): cell is { readonly kind: 'date'; readonly day: LocalDate } {
  return typeof cell === 'object' && cell !== null && cell.kind === 'date';
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('表格没有写成字节');
}
