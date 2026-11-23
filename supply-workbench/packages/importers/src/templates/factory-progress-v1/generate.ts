import * as XLSX from 'xlsx';
import { writeXlsx } from '../../workbook/write.js';
import { SHEETS, type ColumnSpec, type SheetSpec } from './spec/index.js';

const DEMAND_TITLE = '09月排产包材原料需求表';
const NOTES = '说明';
const SLOT_COUNT = 4;

export function generateBlankTemplate(): Uint8Array {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(notes()), NOTES);
  for (const spec of Object.values(SHEETS)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheetRows(spec)), titleOf(spec));
  }
  return writeXlsx(book);
}

function sheetRows(spec: SheetSpec): string[][] {
  const header = spec.columns.map((column) => column.name);
  if (spec.title !== SHEETS.demand.title) return [header];
  return [header, slotRow()];
}

function slotRow(): string[] {
  const row: string[] = [];
  for (let index = 0; index < SLOT_COUNT; index += 1) row.push('到货时间', '数量');
  return row;
}

function notes(): string[][] {
  const rows = [['表', '列', '必填', '说明']];
  for (const spec of Object.values(SHEETS)) {
    for (const column of spec.columns) rows.push([titleOf(spec), column.name, column.required ? '必填' : '可选', noteOf(column)]);
  }
  for (let index = 1; index <= SLOT_COUNT; index += 1) {
    rows.push([DEMAND_TITLE, '到货时间', '可选', '日期写成日期格式，不要写「9月3日」。']);
    rows.push([DEMAND_TITLE, '数量', '可选', '只写数字，不要写单位。']);
  }
  return rows;
}

function titleOf(spec: SheetSpec): string {
  return spec.title === SHEETS.demand.title ? DEMAND_TITLE : spec.title;
}

function noteOf(column: ColumnSpec): string {
  if (isDateColumn(column.name)) return '日期写成日期格式，不要写「9月3日」。';
  if (column.name.includes('单号')) return '一格只写一个单号。';
  if (isQtyColumn(column.name)) return '只写数字，不要写单位。';
  return column.required ? '必填，按原文填写。' : '可以空着。';
}

function isDateColumn(name: string): boolean {
  return name.includes('时间') || name.includes('日期');
}

function isQtyColumn(name: string): boolean {
  return name.includes('数量') || name.includes('用量') || name.includes('需求量');
}
