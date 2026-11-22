export type SearchHit =
  | {
      readonly kind: 'line';
      readonly id: string;
      readonly poRaw: string | null;
      readonly nameRaw: string | null;
      readonly barcodeRaw: string | null;
      readonly itemCodeRaw: string | null;
    }
  | {
      readonly kind: 'product';
      readonly id: string;
      readonly skuName: string;
      readonly barcodeRaw: string;
      readonly filingName: string | null;
    }
  | { readonly kind: 'party'; readonly id: string; readonly displayName: string };

export type SearchResult = {
  readonly lines: readonly Extract<SearchHit, { readonly kind: 'line' }>[];
  readonly products: readonly Extract<SearchHit, { readonly kind: 'product' }>[];
  readonly parties: readonly Extract<SearchHit, { readonly kind: 'party' }>[];
};

export type SearchQuery = { readonly q: string };
