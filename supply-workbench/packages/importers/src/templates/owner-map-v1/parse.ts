import { cellIssue } from '@sw/domain';
import type { ImportParseContext, OwnerMapParsed } from '../../../../application/src/ports/parsed-rows.js';
import type { SheetLike, WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { OWNER_MAP_COLUMNS, compactHeader } from './columns.js';
import { isHeader } from './detect.js';
import { readOwnerMap } from './rows.js';

export function parseOwnerMap(book: WorkbookLike, ctx: ImportParseContext): OwnerMapParsed {
  void ctx;
  const sheet = book.sheets[0];
  if (sheet === undefined) return emptyParsed();
  if (!isHeader(sheet, 1)) return { ...emptyParsed(), rows: [headerMissingRow(sheet)] };
  return { template: 'owner-map-v1', coverage: 'full_snapshot', candidateKeyVersion: 'owner-map-v1', rows: readOwnerMap(sheet) };
}

function emptyParsed(): OwnerMapParsed {
  return { template: 'owner-map-v1', coverage: 'full_snapshot', candidateKeyVersion: 'owner-map-v1', rows: [] };
}

function headerMissingRow(sheet: SheetLike): OwnerMapParsed['rows'][number] {
  const missing = OWNER_MAP_COLUMNS.filter((name, index) => compactHeader(sheet.cell(1, index + 1)?.text ?? '') !== name);
  return {
    sheetName: sheet.name,
    rowNo: 1,
    issues: [cellIssue({ code: 'HEADER_NOT_FOUND', raw: missing.join('、') })],
    action: 'skip',
    targetId: null,
    skipReason: 'HEADER_NOT_FOUND',
    payload: { poRaw: '', ownerNameRaw: '' },
  };
}
