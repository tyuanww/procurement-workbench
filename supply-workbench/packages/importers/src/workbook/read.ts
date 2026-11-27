import { zipSync } from 'fflate';
import type { WorkbookLike, WorkbookReader } from '../../../application/src/ports/workbook-reader.js';
import { readCsv } from './csv.js';
import { readSheetJs } from './sheetjs.js';
import { readXmlWorkbook } from './xml-workbook.js';
import { unzip, type WorkbookArchiveLimits } from './zip-xml.js';

export type ReadXlsxOptions = {
  readonly engine?: 'sheetjs' | 'xml';
  readonly archiveLimits?: WorkbookArchiveLimits;
  readonly captureCalendarDates?: boolean;
};

export function readXlsx({ bytes, fileName, options = {} }: { readonly bytes: Uint8Array; readonly fileName: string; readonly options?: ReadXlsxOptions | undefined }): WorkbookLike {
  const files = unzip(bytes, options.archiveLimits);
  const xml = readXmlWorkbook({ files, fileName, limits: options.archiveLimits });
  if (options.engine === 'xml') return xml;
  try {
    const sheetBytes = options.archiveLimits === undefined ? bytes : zipSync(Object.fromEntries(files), { level: 0 });
    return readSheetJs({ bytes: sheetBytes, xml, captureCalendarDates: options.captureCalendarDates === true });
  } catch (error) {
    if (options.engine === 'sheetjs' || options.archiveLimits !== undefined) throw error;
    return xml;
  }
}

export function workbookReader(options?: ReadXlsxOptions): WorkbookReader {
  return {
    async read(bytes, fileName) {
      if (fileName.toLowerCase().endsWith('.csv')) return readCsv(bytes, fileName);
      return readXlsx({ bytes, fileName, options });
    },
  };
}
