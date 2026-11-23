import * as XLSX from 'xlsx';

export function writeXlsx(book: XLSX.WorkBook): Uint8Array {
  const value: unknown = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('空白模板没有写成字节');
}
