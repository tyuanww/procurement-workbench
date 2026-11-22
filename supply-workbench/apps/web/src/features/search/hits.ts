export type SearchLink = { readonly id: string; readonly label: string; readonly to: string };

export type SearchGroups = {
  readonly lines: readonly SearchLink[];
  readonly products: readonly SearchLink[];
  readonly parties: readonly SearchLink[];
};

const EMPTY: SearchGroups = { lines: [], products: [], parties: [] };

export function searchGroups(value: unknown): SearchGroups {
  if (!isRecord(value)) return EMPTY;
  return {
    lines: linksOf(value.lines, lineOf),
    products: linksOf(value.products, productOf),
    parties: linksOf(value.parties, partyOf),
  };
}

function linksOf(value: unknown, map: (item: Record<string, unknown>) => SearchLink | undefined): SearchLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const link = map(item);
    return link === undefined ? [] : [link];
  });
}

function lineOf(item: Record<string, unknown>): SearchLink | undefined {
  const id = text(item.id);
  if (id === undefined) return undefined;
  const label = [text(item.poRaw), text(item.nameRaw), text(item.barcodeRaw), text(item.itemCodeRaw)].filter((part) => part !== undefined).join(' ');
  return { id, label: label === '' ? id : label, to: `/lines/${id}` };
}

function productOf(item: Record<string, unknown>): SearchLink | undefined {
  const id = text(item.id);
  const label = text(item.skuName);
  if (id === undefined || label === undefined) return undefined;
  return { id, label, to: `/products/${id}` };
}

function partyOf(item: Record<string, unknown>): SearchLink | undefined {
  const id = text(item.id);
  const label = text(item.displayName);
  if (id === undefined || label === undefined) return undefined;
  return { id, label, to: `/parties/${id}` };
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
