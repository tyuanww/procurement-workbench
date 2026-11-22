import type { ParsedRow, PoMasterParsed, PoMasterPayload } from '../../../../application/src/ports/parsed-rows.js';
import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { parseLocalDate, type ImportIssue, type LocalDate } from '@sw/domain';

const YEAR = /^(\d{4})/;
const MONTH_DAY = /^(\d{1,2})月(\d{1,2})日$/;

type Dated = PoMasterPayload['oaSubmittedOn'];

/** CSV 没有文件时间。补年用 uploadedAt 的年份；有 modifiedAt 时用文件年份。 */
export function importYear(book: WorkbookLike, uploadedAt: string): number | null {
  const year = YEAR.exec(book.source.modifiedAt ?? uploadedAt)?.[1];
  if (year === undefined) return null;
  const value = Number(year);
  return Number.isInteger(value) ? value : null;
}

export function fillNoYear(parsed: PoMasterParsed, year: number): PoMasterParsed {
  return { ...parsed, rows: parsed.rows.map((row) => fillRow(row, year)) };
}

function fillRow(row: ParsedRow<PoMasterPayload>, year: number): ParsedRow<PoMasterPayload> {
  const submitted = fillColumn({ cell: row.payload.oaSubmittedOn, column: 'OA提报时间', issues: row.issues, year });
  const required = fillColumn({ cell: row.payload.oaRequiredOn, column: 'OA需求时间', issues: submitted.issues, year });
  const started = fillColumn({ cell: row.payload.actualStartOn, column: '实际开始（半成品订单创建）', issues: required.issues, year });
  const first = fillColumn({ cell: row.payload.firstDeliveryOn, column: '订单首批交付时间', issues: started.issues, year });
  const ended = fillColumn({ cell: row.payload.actualEndOn, column: '实际结束（成品交付完成）', issues: first.issues, year });
  return {
    ...row,
    issues: ended.issues,
    payload: { ...row.payload, oaSubmittedOn: submitted.cell, oaRequiredOn: required.cell, actualStartOn: started.cell, firstDeliveryOn: first.cell, actualEndOn: ended.cell },
  };
}

function fillColumn(input: { readonly cell: Dated; readonly column: string; readonly issues: readonly ImportIssue[]; readonly year: number }): { readonly cell: Dated; readonly issues: readonly ImportIssue[] } {
  const filled = dated(input.cell.raw, input.year);
  if (filled === null || !hasNoYear(input.issues, input.column)) return { cell: input.cell, issues: input.issues };
  return { cell: { raw: input.cell.raw, value: filled }, issues: downgrade(input.issues, input.column) };
}

function hasNoYear(issues: readonly ImportIssue[], column: string): boolean {
  return issues.some((issue) => issue.code === 'DATE_NO_YEAR' && issue.column === column);
}

function downgrade(issues: readonly ImportIssue[], column: string): ImportIssue[] {
  return issues.map((issue) => (issue.code === 'DATE_NO_YEAR' && issue.column === column ? { ...issue, severity: 'info' } : issue));
}

function dated(raw: string | null, year: number): LocalDate | null {
  if (raw === null) return null;
  const matched = MONTH_DAY.exec(raw.normalize('NFKC').trim());
  const month = matched?.[1];
  const day = matched?.[2];
  if (month === undefined || day === undefined) return null;
  const parsed = parseLocalDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  return parsed.ok ? parsed.value : null;
}
