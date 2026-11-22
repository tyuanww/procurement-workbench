import type { OrderLineId } from '../values/ids.js';
import type { ReviewStatus } from '../vocabulary/index.js';
import { isNotProvided, normalizeText } from './text.js';
import { itemCodeMatches, type CodeDecision } from './multi-name.js';

export type FactoryLinkRow = {
  readonly poNorm: string;
  readonly itemCodeNorm: string | null;
  readonly nameRaw: string | null;
  readonly barcodeRaw: string | null;
};

export type FactoryLinkLine = FactoryLinkRow & {
  readonly id: OrderLineId;
  readonly codeDecision: CodeDecision;
};

export type ApprovedCodeLink = {
  readonly leftNorm: string;
  readonly rightNorm: string;
};

export type FactoryLinkResult =
  | { readonly status: 'linked'; readonly lineId: OrderLineId }
  | { readonly status: 'unlinked'; readonly reason: string }
  | { readonly status: 'ambiguous'; readonly lineIds: readonly OrderLineId[]; readonly reason: string };

export type ApprovedRecord = {
  readonly key: string;
  readonly status: ReviewStatus;
  readonly targetId: string | null;
};

export function linkFactoryRow({ row, lines, approvedLinks }: { readonly row: FactoryLinkRow; readonly lines: readonly FactoryLinkLine[]; readonly approvedLinks: readonly ApprovedCodeLink[] }): FactoryLinkResult {
  const sameOrder = lines.filter((line) => samePo(row.poNorm, line.poNorm));
  if (sameOrder.length === 0) return { status: 'unlinked', reason: '采购单号对不上' };
  const matched = sameOrder.filter((line) => itemMatches({ row, line, approvedLinks }));
  return outcome(matched);
}

export function resolveApprovedTarget(key: string, records: readonly ApprovedRecord[]): string | null {
  const query = normalizeText(key);
  if (query === '') return null;
  const matches = records.filter((record) => normalizeText(record.key) === query && record.status === 'approved' && record.targetId !== null);
  if (matches.length !== 1) return null;
  return matches[0]?.targetId ?? null;
}

function outcome(matched: readonly FactoryLinkLine[]): FactoryLinkResult {
  const first = matched[0];
  if (first === undefined) return { status: 'unlinked', reason: '品对不上' };
  if (matched.length === 1) return { status: 'linked', lineId: first.id };
  return { status: 'ambiguous', lineIds: matched.map((line) => line.id), reason: '多于一条订单行' };
}

function itemMatches({ row, line, approvedLinks }: { readonly row: FactoryLinkRow; readonly line: FactoryLinkLine; readonly approvedLinks: readonly ApprovedCodeLink[] }): boolean {
  if (itemCodeMatches({ rowCode: row.itemCodeNorm, lineCode: line.itemCodeNorm, rowName: row.nameRaw, lineName: line.nameRaw, codeDecision: line.codeDecision })) return true;
  if (sameBarcode(row.barcodeRaw, line.barcodeRaw)) return true;
  return linkedCodes({ rowCodes: codesOf(row), lineCodes: codesOf(line), links: approvedLinks });
}

function samePo(row: string, line: string): boolean {
  return row !== '' && row === line;
}

function sameBarcode(row: string | null, line: string | null): boolean {
  if (row === null || line === null || isNotProvided(row) || isNotProvided(line)) return false;
  return row === line;
}

function linkedCodes({ rowCodes, lineCodes, links }: { readonly rowCodes: readonly string[]; readonly lineCodes: readonly string[]; readonly links: readonly ApprovedCodeLink[] }): boolean {
  return links.some((link) => connects({ rowCodes, lineCodes, link }));
}

function connects({ rowCodes, lineCodes, link }: { readonly rowCodes: readonly string[]; readonly lineCodes: readonly string[]; readonly link: ApprovedCodeLink }): boolean {
  const left = normalizeText(link.leftNorm);
  const right = normalizeText(link.rightNorm);
  return (has(rowCodes, left) && has(lineCodes, right)) || (has(rowCodes, right) && has(lineCodes, left));
}

function codesOf(row: FactoryLinkRow): string[] {
  return [row.itemCodeNorm, row.barcodeRaw].flatMap((code) => {
    if (code === null || isNotProvided(code)) return [];
    const normalized = normalizeText(code);
    return normalized === '' ? [] : [normalized];
  });
}

function has(codes: readonly string[], code: string): boolean {
  return codes.some((item) => item === code);
}
