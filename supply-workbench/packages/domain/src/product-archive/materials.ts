export type PartLink = {
  readonly partCodeRaw: string;
  readonly linked: boolean;
};

export type Coverage = { readonly linked: number; readonly total: number } | { readonly kind: 'no_bom' };

export function materialLinkCoverage(parts: readonly PartLink[]): Coverage {
  if (parts.length === 0) return { kind: 'no_bom' };
  return { linked: parts.filter((part) => part.linked).length, total: parts.length };
}

export type BomUse = {
  readonly productBarcodeRaw: string;
  readonly partCodeRaw: string;
};

export type SharedPart = {
  readonly partCodeRaw: string;
  readonly productCount: number;
  readonly products: readonly string[];
};

export function sharedParts(uses: readonly BomUse[]): SharedPart[] {
  const grouped = new Map<string, string[]>();
  for (const use of uses) addUse(grouped, use);
  return [...grouped.entries()]
    .filter((entry) => entry[1].length > 1)
    .map(([partCodeRaw, products]) => ({ partCodeRaw, productCount: products.length, products }));
}

function addUse(grouped: Map<string, string[]>, use: BomUse): void {
  const products = grouped.get(use.partCodeRaw) ?? [];
  if (!products.includes(use.productBarcodeRaw)) products.push(use.productBarcodeRaw);
  grouped.set(use.partCodeRaw, products);
}
