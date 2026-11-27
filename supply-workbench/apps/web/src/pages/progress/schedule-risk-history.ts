export function riskHistoryIndex(key: string): number | null {
  const entry: unknown = globalThis.window?.history.state;
  if (typeof entry !== 'object' || entry === null || !('idx' in entry) || typeof entry.idx !== 'number') return null;
  const actualKey = 'key' in entry ? entry.key : 'default';
  return actualKey === key && Number.isInteger(entry.idx) ? entry.idx : null;
}

export function canPopToSource(state: unknown, key: string): boolean {
  if (typeof state !== 'object' || state === null || !('riskSourceIndex' in state) || typeof state.riskSourceIndex !== 'number') return false;
  const current = riskHistoryIndex(key);
  return current !== null && current === state.riskSourceIndex + 1;
}
