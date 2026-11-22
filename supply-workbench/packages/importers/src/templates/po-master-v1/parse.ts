import { cellIssue, DEFAULT_SETTINGS } from '@sw/domain';
import type { ImportParseContext, ParsedRow, PoMasterParsed, PoMasterPayload } from '../../../../application/src/ports/parsed-rows.js';
import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { masterSheet, readHeader } from './headers.js';
import { markDuplicates } from './keys.js';
import { attachProjectDates, readProcurementPreview } from './procurement.js';
import { readBody } from './row.js';

export function parsePoMaster(book: WorkbookLike, ctx: ImportParseContext): PoMasterParsed {
  const sheet = masterSheet(book);
  if (sheet === undefined) return failed('没有表', 'po-master');
  const header = readHeader(sheet);
  if (header.missing.length > 0) return failed(header.missing.join('、'), sheet.name);
  const options = { date1904: book.date1904, dateSanityRange: ctx.dateSanityRange ?? DEFAULT_SETTINGS.dateSanityRange };
  const rows = attachProjectDates({ sheets: book.sheets, rows: readBody({ sheet, columns: header.columns, ...options }), options });
  const procurement = readProcurementPreview({ sheets: book.sheets, rows });
  return {
    template: 'po-master-v1',
    coverage: 'full_snapshot',
    candidateKeyVersion: 'po-master-v1',
    rows: markDuplicates(rows),
    ...(procurement === undefined ? {} : { procurement }),
  };
}

function failed(raw: string, sheetName: string): PoMasterParsed {
  return { template: 'po-master-v1', coverage: 'full_snapshot', candidateKeyVersion: 'po-master-v1', rows: [failedRow(raw, sheetName)] };
}

function failedRow(raw: string, sheetName: string): ParsedRow<PoMasterPayload> {
  return {
    sheetName,
    rowNo: 1,
    issues: [cellIssue({ code: 'HEADER_NOT_FOUND', raw })],
    action: 'skip',
    targetId: null,
    skipReason: 'HEADER_NOT_FOUND',
    payload: blankPayload(),
  };
}

function blankPayload(): PoMasterPayload {
  const empty = { raw: null, value: null };
  return {
    oaDemandRef: empty,
    supplierRaw: empty,
    nameRaw: empty,
    barcodeRaw: empty,
    qtyOrdered: empty,
    oaSubmittedOn: empty,
    oaRequiredOn: empty,
    plannedDurationDays: empty,
    po: empty,
    actualStartOn: empty,
    firstDeliveryOn: empty,
    actualEndOn: empty,
    actualDurationDays: empty,
    factoryStockReported: empty,
    shippedQtyReported: empty,
    qtyDiffReported: empty,
    statusReported: empty,
    ownerRaw: empty,
    factoryRaw: empty,
  };
}
