import type { CellLike } from '../../../application/src/ports/workbook-reader.js';
import { cellIssue, isNotProvided, parsedCell, unparsedCell, type IssueCode, type CellParse } from '@sw/domain';
import { cellRaw, isFormulaError } from './tokens.js';

const WAN_MULTIPLIER = 10_000;
const QTY_FACTOR = 10_000;

export function parseQty(cell: CellLike): CellParse<number | null> {
  if (cell.kind === 'error' || isFormulaError(cell.text)) return rejected(cell, 'FORMULA_ERROR');
  if (cell.kind === 'number') return numberQty(cell);
  if (cell.kind === 'empty' || isNotProvided(cell.text)) return blank(cell);
  return textQty(cell);
}

function numberQty(cell: CellLike): CellParse<number | null> {
  if (typeof cell.value !== 'number' || !Number.isFinite(cell.value)) return rejected(cell, 'QTY_TEXT');
  return accepted({ cell, value: cell.value });
}

function textQty(cell: CellLike): CellParse<number | null> {
  const text = cell.text.normalize('NFKC').trim();
  if (text === '' || isNotProvided(text)) return blank(cell);
  const parsed = readQty(text);
  if (parsed === null) return rejected(cell, 'QTY_TEXT');
  const issues = parsed.codes.map((code) => cellIssue({ code, raw: cellRaw(cell) }));
  return accepted({ cell, value: parsed.value, issues });
}

function readQty(text: string): { readonly value: number; readonly codes: readonly IssueCode[] } | null {
  const wan = splitWan(text);
  const separated = splitThousands(wan.body);
  if (!isDecimal(separated.text)) return null;
  const amount = Number(separated.text);
  if (!Number.isFinite(amount)) return null;
  return { value: wan.isWan ? asWan(amount) : amount, codes: qtyCodes(wan.isWan, separated.hasComma) };
}

function splitWan(text: string): { readonly body: string; readonly isWan: boolean } {
  const body = /^(.*?)(?:万|[Ww])$/.exec(text)?.[1];
  if (body === undefined) return { body: text, isWan: false };
  return { body: body.trim(), isWan: true };
}

function splitThousands(text: string): { readonly text: string; readonly hasComma: boolean } {
  if (!text.includes(',')) return { text, hasComma: false };
  return { text: text.replaceAll(',', ''), hasComma: true };
}

function isDecimal(text: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(text);
}

function qtyCodes(isWan: boolean, hasComma: boolean): IssueCode[] {
  const codes: IssueCode[] = [];
  if (isWan) codes.push('QTY_WAN');
  if (hasComma) codes.push('QTY_THOUSANDS_SEP');
  return codes;
}

function asWan(amount: number): number {
  const scaled = amount * WAN_MULTIPLIER;
  return Math.round(scaled * QTY_FACTOR) / QTY_FACTOR;
}

function accepted({ cell, value, issues = [] }: { readonly cell: CellLike; readonly value: number; readonly issues?: ReturnType<typeof cellIssue>[] | undefined }): CellParse<number> {
  const formula = cell.formula === undefined ? [] : [cellIssue({ code: 'FORMULA_VALUE', raw: cellRaw(cell) })];
  return parsedCell({ value, raw: cellRaw(cell), issues: [...formula, ...issues] });
}

function rejected(cell: CellLike, code: IssueCode): CellParse<null> {
  return unparsedCell(cellRaw(cell), [cellIssue({ code, raw: cellRaw(cell) })]);
}

function blank(cell: CellLike): CellParse<null> {
  return parsedCell({ value: null, raw: cellRaw(cell), issues: [], missingReason: 'not_provided' });
}
