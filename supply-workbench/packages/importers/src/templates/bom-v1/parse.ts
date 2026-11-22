import type { BomParsed } from '../../../../application/src/ports/parsed-rows.js';
import type { ImportParseContext } from '../../../../application/src/ports/parsed-rows.js';
import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { readBom } from './rows.js';

export function parseBom(book: WorkbookLike, ctx: ImportParseContext): BomParsed {
  void ctx;
  const sheet = book.sheets[0];
  if (sheet === undefined) return { template: 'bom-v1', coverage: 'full_snapshot', candidateKeyVersion: 'bom-v1', rows: [] };
  return { template: 'bom-v1', coverage: 'full_snapshot', candidateKeyVersion: 'bom-v1', rows: readBom(sheet) };
}
