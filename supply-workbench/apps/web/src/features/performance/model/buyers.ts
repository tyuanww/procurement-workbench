import { EM_DASH, type EmDash } from './figures.js';
import type { DashboardLane } from './query.js';

export type BuyerInput = {
  readonly buyerId: string;
  readonly name: string | null;
  readonly openBatches: number;
  readonly overdue: number;
  readonly dueToday: number;
  readonly missingDate: number;
  readonly openLines: number | null;
  readonly openExceptions: number | null;
  readonly followUpsInPeriod: number | null;
};

export type BuyerBarRow = Omit<BuyerInput, 'name' | 'openLines' | 'openExceptions' | 'followUpsInPeriod'> & {
  readonly name: string;
  readonly href: `/lines?${string}`;
  readonly openLines: number | EmDash;
  readonly openExceptions: number | EmDash;
  readonly followUpsInPeriod: number | EmDash;
};

export function buyerView(input: { readonly rows: readonly BuyerInput[]; readonly lane: DashboardLane }): readonly BuyerBarRow[] {
  return input.rows.map((row) => ({
    ...row,
    name: row.name ?? EM_DASH,
    href: buyerHref({ buyerId: row.buyerId, lane: input.lane }),
    openLines: row.openLines ?? EM_DASH,
    openExceptions: row.openExceptions ?? EM_DASH,
    followUpsInPeriod: row.followUpsInPeriod ?? EM_DASH,
  }));
}

function buyerHref({ buyerId, lane }: { readonly buyerId: string; readonly lane: DashboardLane }): `/lines?${string}` {
  const line = lane === 'all' ? '' : `&lane=${lane}`;
  return `/lines?buyer=${encodeURIComponent(buyerId)}${line}`;
}
