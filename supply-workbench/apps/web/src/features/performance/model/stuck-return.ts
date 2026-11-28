export const STUCK_BATCH_PARAM = 'stuckBatch';
export const STUCK_RETURN_PARAM = 'backToStuck';

export function stuckReturnAddress(search: string | null): string | null {
  const params = new URLSearchParams(search ?? '');
  const view = params.get('view');
  if (!params.get(STUCK_BATCH_PARAM) || (view !== null && view !== 'stuck')) return null;
  return `/dashboard?${params}`;
}

export function stuckOrderFocus(batchId: string): string {
  return `stuck-order:${batchId}`;
}
