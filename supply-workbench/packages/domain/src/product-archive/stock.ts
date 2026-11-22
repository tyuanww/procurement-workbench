import { missing, type Missing } from '../values/provenance.js';
import type { ApprovedCodeLink } from '../identity/linking.js';

export type StockRow = {
  readonly codeNorm: string;
  readonly qty: number | null;
  readonly importBatchId: string;
};

export type FactoryStock =
  | { readonly kind: 'linked'; readonly rows: readonly StockRow[]; readonly total: number | null }
  | { readonly kind: 'missing'; readonly missing: Missing; readonly nextStep: 'review_code_links' | null };

export function resolveFactoryStock({ barcodeRaw, approvedLinks, stockRows }: { readonly barcodeRaw: string; readonly approvedLinks: readonly ApprovedCodeLink[]; readonly stockRows: readonly StockRow[] }): FactoryStock {
  const codes = linkedCodes(barcodeRaw, approvedLinks);
  if (codes.length === 0) return { kind: 'missing', missing: missing('no_matching_record'), nextStep: 'review_code_links' };
  const rows = stockRows.filter((row) => codes.some((code) => code === row.codeNorm));
  if (rows.length === 0) return { kind: 'missing', missing: missing('no_matching_record'), nextStep: null };
  return { kind: 'linked', rows, total: sameBatchTotal(rows) };
}

function linkedCodes(barcodeRaw: string, links: readonly ApprovedCodeLink[]): string[] {
  const codes = new Set<string>();
  for (const link of links) {
    if (link.leftNorm === barcodeRaw) codes.add(link.rightNorm);
    if (link.rightNorm === barcodeRaw) codes.add(link.leftNorm);
  }
  return [...codes];
}

function sameBatchTotal(rows: readonly StockRow[]): number | null {
  const batch = rows[0]?.importBatchId;
  if (batch === undefined || rows.some((row) => row.importBatchId !== batch)) return null;
  let total = 0;
  for (const row of rows) {
    if (row.qty === null) return null;
    total += row.qty;
  }
  return total;
}
