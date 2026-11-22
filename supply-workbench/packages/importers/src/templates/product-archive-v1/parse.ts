import { cellIssue } from '@sw/domain';
import type { ImportParseContext, ProductArchiveParsed } from '../../../../application/src/ports/parsed-rows.js';
import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { readHeader } from './headers.js';
import { readBody } from './row.js';

export function parseProductArchive(book: WorkbookLike, ctx: ImportParseContext): ProductArchiveParsed {
  void ctx;
  const sheet = book.sheets[0];
  if (sheet === undefined) return { template: 'product-archive-v1', coverage: 'full_snapshot', candidateKeyVersion: 'product-archive-v1', rows: [] };
  const header = readHeader(sheet);
  if (header.missing.length > 0) {
    return { template: 'product-archive-v1', coverage: 'full_snapshot', candidateKeyVersion: 'product-archive-v1', rows: [{ sheetName: sheet.name, rowNo: 1, issues: [cellIssue({ code: 'HEADER_NOT_FOUND', raw: header.missing.join('、') })], action: 'skip', targetId: null, skipReason: 'HEADER_NOT_FOUND', payload: blank() }] };
  }
  return { template: 'product-archive-v1', coverage: 'full_snapshot', candidateKeyVersion: 'product-archive-v1', rows: readBody({ sheet, columns: header.columns }) };
}

function blank(): ProductArchiveParsed['rows'][number]['payload'] {
  const empty = { raw: null, value: null };
  return { filingName: empty, filingNo: empty, skuName: empty, barcodeRaw: empty, netContent: empty, casePack: empty, outerSize: empty, contactNameRaw: empty };
}
