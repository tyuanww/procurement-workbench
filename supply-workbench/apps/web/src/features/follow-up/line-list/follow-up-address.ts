export const FOLLOW_UP_FRAGMENT = '#follow-up?';
// Leave room for HTTP headers and for the caller's return address.
const QUERY_LIMIT = 6_000;
const selectionKeys = ['riskLine', 'deliveryQuery', 'backToDelivery'] as const;

export function followUpAddress(path: string, params: URLSearchParams): string {
  const search = params.toString();
  if (search.length <= QUERY_LIMIT) return search === '' ? path : `${path}?${search}`;
  const query = new URLSearchParams(params);
  const fragment = new URLSearchParams();
  for (const key of selectionKeys) moveParam(key, { from: query, to: fragment });
  const address = query.size === 0 ? path : `${path}?${query}`;
  return fragment.size === 0 ? address : `${address}${FOLLOW_UP_FRAGMENT}${fragment}`;
}

export function followUpParams(search: string, hash: string): URLSearchParams {
  const query = new URLSearchParams(search);
  if (!hash.startsWith(FOLLOW_UP_FRAGMENT)) return query;
  const fragment = new URLSearchParams(hash.slice(FOLLOW_UP_FRAGMENT.length));
  for (const key of selectionKeys) {
    if (!query.has(key)) moveParam(key, { from: fragment, to: query });
  }
  return query;
}

function moveParam(key: string, { from, to }: { readonly from: URLSearchParams; readonly to: URLSearchParams }) {
  for (const value of from.getAll(key)) to.append(key, value);
  from.delete(key);
}

export function importBatchOf(params: URLSearchParams): string | undefined {
  return params.get('importBatchId') || undefined;
}
