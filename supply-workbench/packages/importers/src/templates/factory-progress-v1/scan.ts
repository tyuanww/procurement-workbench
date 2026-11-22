import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { PendingCodeLink } from '../../../../application/src/ports/parsed-rows.js';
import { cellIssue, type ImportIssue, type Settings } from '@sw/domain';
import { hashFields, type DraftRow } from './fingerprint.js';
import { findHeader, rowMark } from './headers.js';
import { sheetReader, type SheetReader } from './read-cell.js';
import type { ColumnSpec } from './spec/index.js';

export type Built<T> = {
  readonly payload: T;
  readonly issues: readonly ImportIssue[];
  readonly links: readonly PendingCodeLink[];
};

export function scanSheet<T>(input: {
  readonly sheet: SheetLike;
  readonly columns: readonly ColumnSpec[];
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
  readonly build: (ctx: { readonly reader: SheetReader; readonly row: number; readonly isOk: boolean }) => Built<T>;
  readonly fields: (payload: T) => readonly string[];
}): { readonly rows: DraftRow<T>[]; readonly links: PendingCodeLink[]; readonly missingHeader: boolean } {
  const header = findHeader(input.sheet, input.columns);
  if (header === null) return { rows: [], links: [], missingHeader: true };
  const reader = sheetReader({ sheet: input.sheet, header, date1904: input.date1904, dateSanityRange: input.dateSanityRange });
  const rows: DraftRow<T>[] = [];
  const links: PendingCodeLink[] = [];
  for (let row = header.headerRow + 1; row <= input.sheet.rowCount; row += 1) {
    const mark = rowMark(input.sheet, row);
    if (mark === 'empty') continue;
    const built = input.build({ reader, row, isOk: mark === 'ok' });
    rows.push(draftRow({ sheetName: input.sheet.name, rowNo: row, built, isOk: mark === 'ok', fields: input.fields }));
    links.push(...built.links);
  }
  return { rows, links, missingHeader: false };
}

function draftRow<T>(input: {
  readonly sheetName: string;
  readonly rowNo: number;
  readonly built: Built<T>;
  readonly isOk: boolean;
  readonly fields: (payload: T) => readonly string[];
}): DraftRow<T> {
  const issues = input.isOk ? [...input.built.issues, cellIssue({ code: 'ROW_EMPTY_LIKE', raw: 'OK', column: null })] : input.built.issues;
  return {
    sheetName: input.sheetName,
    rowNo: input.rowNo,
    issues,
    action: null,
    targetId: null,
    skipReason: input.isOk ? 'ROW_EMPTY_LIKE' : null,
    payload: input.built.payload,
    base: hashFields(input.sheetName, input.fields(input.built.payload)),
  };
}
