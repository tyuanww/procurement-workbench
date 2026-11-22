import type { SheetLike } from '../../../../../application/src/ports/workbook-reader.js';
import type { PendingCodeLink, ScheduleCellPayload } from '../../../../../application/src/ports/parsed-rows.js';
import { cellIssue, isNotProvided, type ImportIssue, type LocalDate, type Settings } from '@sw/domain';
import { parseDate } from '../../../normalize/date.js';
import { parseQty } from '../../../normalize/qty.js';
import { hashFields, numberField, poField, textField, type DraftRow } from '../fingerprint.js';
import { findHeader } from '../headers.js';
import { sheetReader, take, type SheetReader } from '../read-cell.js';
import { SHEETS } from '../spec/index.js';

const DAY_SCAN = 80;

type DayColumn = { readonly col: number; readonly day: LocalDate };

export function scheduleDates(sheet: SheetLike, input: { readonly date1904: boolean; readonly dateSanityRange: Settings['dateSanityRange'] }): LocalDate[] {
  const header = findHeader(sheet, SHEETS.schedule.columns);
  if (header === null) return [];
  return dayColumns({ sheet, headerRow: header.headerRow, input }).map((column) => column.day);
}

export function parseSchedule(input: {
  readonly sheet: SheetLike;
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
}): { readonly rows: DraftRow<ScheduleCellPayload>[]; readonly links: PendingCodeLink[]; readonly missingHeader: boolean } {
  const header = findHeader(input.sheet, SHEETS.schedule.columns);
  if (header === null) return { rows: [], links: [], missingHeader: true };
  const reader = sheetReader({ sheet: input.sheet, header, date1904: input.date1904, dateSanityRange: input.dateSanityRange });
  const days = dayColumns({ sheet: input.sheet, headerRow: header.headerRow, input });
  const rows: DraftRow<ScheduleCellPayload>[] = [];
  for (let row = header.headerRow + 1; row <= input.sheet.rowCount; row += 1) {
    rows.push(...cellsOf({ sheet: input.sheet, reader, row, days }));
  }
  return { rows, links: [], missingHeader: false };
}

function dayColumns({ sheet, headerRow, input }: { readonly sheet: SheetLike; readonly headerRow: number; readonly input: { readonly date1904: boolean; readonly dateSanityRange: Settings['dateSanityRange'] } }): DayColumn[] {
  const days: DayColumn[] = [];
  for (let col = 7; col <= DAY_SCAN; col += 1) {
    const cell = sheet.cell(headerRow, col);
    if (cell === null || cell.kind !== 'number') continue;
    const parsed = parseDate(cell, { date1904: input.date1904, dateSanityRange: input.dateSanityRange });
    if (parsed.value === null) continue;
    days.push({ col, day: parsed.value });
  }
  return days;
}

function cellsOf(input: { readonly sheet: SheetLike; readonly reader: SheetReader; readonly row: number; readonly days: readonly DayColumn[] }): DraftRow<ScheduleCellPayload>[] {
  const issues: ImportIssue[] = [];
  const identity = {
    po: take(issues, input.reader.po(input.row, '订单号')),
    itemCodeRaw: take(issues, input.reader.code(input.row, '品号')),
    nameRaw: take(issues, input.reader.text({ row: input.row, name: '产品名称' })),
    monthRaw: take(issues, input.reader.text({ row: input.row, name: '月份' })),
    newOrOldRaw: take(issues, input.reader.text({ row: input.row, name: '新老品' })),
    qtyRequiredTotal: take(issues, input.reader.qty(input.row, '要求排产总数')),
  };
  if (identity.po.value === null && identity.itemCodeRaw.value === null && identity.nameRaw.value === null) return [];
  return input.days.flatMap((day) => cellRecord({ sheet: input.sheet, row: input.row, day, identity, sharedIssues: issues }));
}

function cellRecord(input: {
  readonly sheet: SheetLike;
  readonly row: number;
  readonly day: DayColumn;
  readonly identity: Omit<ScheduleCellPayload, 'day' | 'qty' | 'stepRaw'>;
  readonly sharedIssues: readonly ImportIssue[];
}): DraftRow<ScheduleCellPayload>[] {
  const cell = input.sheet.cell(input.row, input.day.col);
  if (cell === null || isNotProvided(cell.text)) return [];
  if (cell.kind !== 'number' && cell.kind !== 'string') return [];
  const qty = cell.kind === 'number' ? parseQty(cell).value : null;
  const stepRaw = cell.kind === 'string' ? cell.text : null;
  const issues = [...input.sharedIssues, ...(cell.mergedFrom === undefined ? [] : [cellIssue({ code: 'MERGED_FILL', raw: cell.text, column: null })])];
  const payload = { ...input.identity, day: input.day.day, qty, stepRaw };
  return [draft({ sheetName: input.sheet.name, rowNo: input.row, payload, issues })];
}

function draft(input: { readonly sheetName: string; readonly rowNo: number; readonly payload: ScheduleCellPayload; readonly issues: readonly ImportIssue[] }): DraftRow<ScheduleCellPayload> {
  const payload = input.payload;
  return {
    sheetName: input.sheetName,
    rowNo: input.rowNo,
    issues: input.issues,
    action: null,
    targetId: null,
    skipReason: null,
    payload,
    base: hashFields(input.sheetName, [
      poField(payload.po),
      textField(payload.itemCodeRaw),
      textField(payload.nameRaw),
      textField(payload.monthRaw),
      textField(payload.newOrOldRaw),
      numberField(payload.qtyRequiredTotal),
      payload.day,
      payload.qty === null ? '' : String(payload.qty),
      payload.stepRaw ?? '',
    ]),
  };
}
