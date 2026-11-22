// 位数是编码格式本身，不是可调的业务阈值。

import type { CodeType } from '../vocabulary/identity.js';
import { cellIssue } from './issue.js';
import { blankCell, parsedCell, type CellParse } from './parsed.js';
import { isNotProvided } from './text.js';

export type ParsedItemCode = {
  readonly codeType: CodeType;
  readonly codeNorm: string;
};

export type ItemCodeContext = {
  readonly isBomPartColumn: boolean;
};

const PLAIN_BARCODE = /^\d{13}$/;
const SUFFIX_BARCODE = /^\d{13}-\d+$/;
const BOM_PART_LENGTH = /^\d{10,11}$/;

export function parseItemCode(
  raw: string,
  context: ItemCodeContext = { isBomPartColumn: false },
): CellParse<ParsedItemCode | null> {
  const code = raw.normalize('NFKC').trim();
  if (isNotProvided(raw)) return blankCell(raw);
  if (context.isBomPartColumn) return bomPart(raw, code);
  return classify(raw, code);
}

export function parseBarcode(raw: string): CellParse<string | null> {
  const code = raw.normalize('NFKC').trim();
  if (isNotProvided(raw)) return blankCell(raw);
  if (PLAIN_BARCODE.test(code)) return parsedCell({ value: code, raw, issues: [] });
  if (SUFFIX_BARCODE.test(code)) return parsedCell({ value: code, raw, issues: [cellIssue({ code: 'BARCODE_SUFFIX', raw })] });
  return parsedCell({ value: code, raw, issues: [cellIssue({ code: 'BARCODE_LENGTH', raw })] });
}

function classify(raw: string, code: string): CellParse<ParsedItemCode> {
  const semi = matchSemi(code);
  if (semi !== null) return known(raw, semi);
  const erp = matchErp(code);
  if (erp !== null) return known(raw, erp);
  const pack = matchPack(code);
  if (pack !== null) return known(raw, pack);
  const material = matchRawK(raw, code);
  if (material !== null) return material;
  const barcode = matchBarcode(raw, code);
  if (barcode !== null) return barcode;
  return unknown(raw, code);
}

function known(raw: string, value: ParsedItemCode): CellParse<ParsedItemCode> {
  return parsedCell({ value, raw, issues: [] });
}

function unknown(raw: string, code: string): CellParse<ParsedItemCode> {
  return parsedCell({
    value: { codeType: 'other', codeNorm: code },
    raw,
    issues: [cellIssue({ code: 'CODE_UNKNOWN_PATTERN', raw })],
  });
}

function matchSemi(code: string): ParsedItemCode | null {
  if (!/^500068(?:70|76)$/.test(code)) return null;
  return { codeType: 'semi_50', codeNorm: code };
}

function matchErp(code: string): ParsedItemCode | null {
  if (!/^70\d{6}$/.test(code)) return null;
  return { codeType: 'erp_70', codeNorm: code };
}

function matchPack(code: string): ParsedItemCode | null {
  if (!/^30\d{6}$/.test(code)) return null;
  return { codeType: 'pack_30', codeNorm: code };
}

function matchRawK(raw: string, code: string): CellParse<ParsedItemCode> | null {
  if (!/^[Kk]\d+$/.test(code)) return null;
  const codeNorm = code.toUpperCase();
  const issues = codeNorm === code ? [] : [cellIssue({ code: 'CODE_CASE', raw })];
  return parsedCell({ value: { codeType: 'raw_k', codeNorm }, raw, issues });
}

function matchBarcode(raw: string, code: string): CellParse<ParsedItemCode> | null {
  if (!PLAIN_BARCODE.test(code) && !SUFFIX_BARCODE.test(code)) return null;
  const issues = code.includes('-') ? [cellIssue({ code: 'BARCODE_SUFFIX', raw })] : [];
  return parsedCell({ value: { codeType: 'barcode_69', codeNorm: code }, raw, issues });
}

function bomPart(raw: string, code: string): CellParse<ParsedItemCode> {
  const issues = BOM_PART_LENGTH.test(code) ? [] : [cellIssue({ code: 'BARCODE_LENGTH', raw })];
  return parsedCell({ value: { codeType: 'bom_part', codeNorm: code }, raw, issues });
}
