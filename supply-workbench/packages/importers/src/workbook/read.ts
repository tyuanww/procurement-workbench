import type { WorkbookLike, WorkbookReader } from '../../../application/src/ports/workbook-reader.js';
import { readCsv } from './csv.js';
import { readSheetJs } from './sheetjs.js';
import { readXmlWorkbook } from './xml-workbook.js';

export type ReadXlsxOptions = { readonly engine?: 'sheetjs' | 'xml' };

export function readXlsx({ bytes, fileName, options = {} }: { readonly bytes: Uint8Array; readonly fileName: string; readonly options?: ReadXlsxOptions | undefined }): WorkbookLike {
  if (options.engine === 'xml') return readXmlWorkbook(bytes, fileName);
  try {
    return readSheetJs(bytes, fileName);
  } catch (error) {
    if (options.engine === 'sheetjs') throw error;
    return readXmlWorkbook(bytes, fileName);
  }
}

export function workbookReader(): WorkbookReader {
  return {
    async read(bytes, fileName) {
      if (fileName.toLowerCase().endsWith('.csv')) return readCsv(bytes, fileName);
      return readXlsx({ bytes, fileName });
    },
  };
}
