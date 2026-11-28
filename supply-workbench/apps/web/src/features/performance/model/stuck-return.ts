import { readDashboardSubview } from './query.js';

export const STUCK_BATCH_PARAM = 'stuckBatch';
export const STUCK_RETURN_PARAM = 'backToStuck';

export function stuckReturnAddress(search: string | null): string | null {
  const params = new URLSearchParams(search ?? '');
  if (!params.get(STUCK_BATCH_PARAM) || readDashboardSubview(params.get('view')) !== null) return null;
  return `/dashboard?${params}`;
}

export function stuckOrderFocus(batchId: string): string {
  return `stuck-order:${batchId}`;
}
