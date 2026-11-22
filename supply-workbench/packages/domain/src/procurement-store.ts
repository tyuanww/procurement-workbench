export const PROCUREMENT_STORES = ['store_a', 'store_b', 'unassigned', 'all'] as const;
export type ProcurementStore = (typeof PROCUREMENT_STORES)[number];

const OA_REFERENCE = /(?<![a-z0-9])(?:(XPKA[ \t]*[（(][ \t]*CN[ \t]*[）)][ \t]*[0-9０-９]+)(?:[-－][0-9０-９]+)*|(CGSQ[0-9０-９]+))(?![a-z0-9])/giu;

export function normalizeProcurementReference(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/gu, '').toUpperCase();
}

export function procurementOaReferences(raw: string | null): readonly { readonly raw: string; readonly main: string }[] {
  return [...(raw ?? '').matchAll(OA_REFERENCE)].flatMap(([reference, projectMain, purchaseMain]) => {
    const main = projectMain ?? purchaseMain;
    return main === undefined ? [] : [{ raw: reference, main: normalizeProcurementReference(main) }];
  });
}
