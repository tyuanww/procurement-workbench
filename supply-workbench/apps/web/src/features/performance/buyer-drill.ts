import type { BuyerDrillView } from '@sw/contracts';
import { fetchBuyerDrill } from '../../shared/api/catalog.js';
import type { DashboardLane } from './model/query.js';

export type BuyerDrillSelection =
  | { readonly kind: 'overdue'; readonly buyerId: string; readonly buyerName: string; readonly lane: DashboardLane }
  | { readonly kind: 'unassigned-exceptions' };

export function loadBuyerDrill({ selection, signal }: {
  readonly selection: BuyerDrillSelection;
  readonly signal: AbortSignal;
}): Promise<BuyerDrillView> {
  const params = new URLSearchParams({ kind: selection.kind });
  if (selection.kind === 'overdue') {
    params.set('buyerId', selection.buyerId);
    if (selection.lane !== 'all') params.set('lane', selection.lane);
  }
  return fetchBuyerDrill(params, signal);
}
