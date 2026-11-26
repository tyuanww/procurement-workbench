import type { CellLike } from '../../../../application/src/ports/workbook-reader.js';
import { parseQty } from '../../normalize/qty.js';

export function exactQty(cell: CellLike, scale: number): number | null {
  const { value } = parseQty(cell);
  if (value === null || value < 0) return null;
  const typed = cell.text.normalize('NFKC').trim().replaceAll(',', '');
  const decimal = /[万w]$/iu.test(typed)
    ? decimalOf(typed.slice(0, -1).trim(), 4)
    : decimalOf(typed);
  if (decimal === null || decimal.exponent < -scale) return null;
  const exact = Number(`${decimal.digits}e${decimal.exponent}`);
  const serialized = decimalOf(String(exact));
  return serialized?.digits === decimal.digits && serialized.exponent === decimal.exponent ? exact : null;
}

function decimalOf(input: string, power = 0): { readonly digits: string; readonly exponent: number } | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/iu.exec(input);
  if (match === null) return null;
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  const mantissa = `${whole}${fraction}`.replace(/^0+/u, '');
  if (mantissa === '') return { digits: '0', exponent: 0 };
  const digits = mantissa.replace(/0+$/u, '');
  return {
    digits: `${sign}${digits}`,
    exponent: Number(exponent) + power - fraction.length + mantissa.length - digits.length,
  };
}
