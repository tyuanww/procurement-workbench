export type UrlState = Record<string, string>;

export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const state: UrlState = {};
  for (const [key, value] of params) state[key] = value;
  return state;
}

export function useUrlStatePatch(search: string, replace: (next: string) => void) {
  return (patch: Record<string, string | null>) => replace(writeUrlState(search, patch));
}

export function writeUrlState(search: string, patch: Record<string, string | null>): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  }
  const next = params.toString();
  return next === '' ? '' : `?${next}`;
}
