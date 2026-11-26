import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { writeXlsx } from '../../workbook/write.js';
import { ARCHIVE, ARCHIVE_COLUMNS, BARCODE, BOM, MATERIAL_COLUMNS, PART_BARCODE } from './columns.js';

export function generateProductWorkbookTemplate(): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const columnsBySheet = [
    addTemplateSheet(workbook, { name: ARCHIVE, columns: ARCHIVE_COLUMNS }),
    addTemplateSheet(workbook, { name: BOM, columns: MATERIAL_COLUMNS }),
  ];
  return formatBarcodeColumns(writeXlsx(workbook), columnsBySheet);
}

function addTemplateSheet(workbook: XLSX.WorkBook, { name, columns }: { readonly name: string; readonly columns: readonly string[] }): ReadonlySet<number> {
  const sheet = XLSX.utils.aoa_to_sheet([[...columns]]);
  sheet['!cols'] = columns.map((label) => ({ wch: Math.max(20, label.length * 2 + 2) }));
  const barcodeColumns = new Set<number>();
  for (const [index, label] of columns.entries()) {
    if (label !== BARCODE && label !== PART_BARCODE) continue;
    const header = sheet[XLSX.utils.encode_cell({ r: 0, c: index })];
    header.z = '@';
    barcodeColumns.add(index + 1);
  }
  XLSX.utils.book_append_sheet(workbook, sheet, name);
  return barcodeColumns;
}

function formatBarcodeColumns(bytes: Uint8Array, columnsBySheet: readonly ReadonlySet<number>[]): Uint8Array {
  const files = unzipSync(bytes);
  const styles = files['xl/styles.xml'];
  const cellStyles = styles === undefined ? '' : /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/u.exec(strFromU8(styles))?.[1] ?? '';
  const textStyle = [...cellStyles.matchAll(/<xf\b[^>]*>/gu)].findIndex(([tag]) => tag.includes('numFmtId="49"'));
  if (textStyle < 0) throw new Error('工作簿没有生成条码文本格式');
  for (const [index, columns] of columnsBySheet.entries()) {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const xml = files[path];
    if (xml === undefined) throw new Error('工作簿没有生成业务工作表');
    files[path] = strToU8(strFromU8(xml).replace(/<col\b[^>]*\bmin="(\d+)"[^>]*\/>/gu, (tag, column: string) =>
      columns.has(Number(column)) ? `${tag.slice(0, -2)} style="${textStyle}"/>` : tag));
  }
  return zipSync(files);
}
