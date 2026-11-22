import type { CellLike } from '../../../application/src/ports/workbook-reader.js';

const FORMULA_ERRORS = new Set(['#VALUE!', '#DIV/0!', '#REF!', '#N/A', '#NAME?']);

export function isFormulaError(text: string): boolean {
  return FORMULA_ERRORS.has(text.normalize('NFKC').trim());
}

export function cellRaw(cell: CellLike): string {
  if (cell.text !== '') return cell.text;
  if (typeof cell.value === 'number' || typeof cell.value === 'string') return String(cell.value);
  return '';
}
