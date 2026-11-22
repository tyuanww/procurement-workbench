import type { Lane, LineStage, LocalDate, ProcurementStore } from '@sw/domain';
import type { PageQuery } from '../shared/page.js';

export type BuyerFilter =
  | { readonly kind: 'me' }
  | { readonly kind: 'unassigned' }
  | { readonly kind: 'user'; readonly userId: string };

export type LinesQuery = PageQuery & {
  readonly store?: ProcurementStore;
  readonly lane?: Lane;
  readonly q?: string;
  readonly supplierPartyId?: string;
  readonly inTransitFactory?: 'factory_a';
  readonly receiverPartyId?: string;
  readonly buyer?: BuyerFilter;
  readonly stages?: readonly LineStage[];
  readonly statusReported?: readonly string[];
  readonly overdueOnly?: boolean;
  readonly hasOpenException?: boolean;
  readonly missingInLatestImport?: boolean;
  readonly confirmedFrom?: LocalDate;
  readonly confirmedTo?: LocalDate;
  readonly importBatchId?: string;
};

export type LineSummary = {
  readonly total: number;
  readonly overdue: number;
  readonly dueToday: number;
  readonly missingDate: number;
  readonly stages: readonly { readonly stage: LineStage; readonly count: number }[];
};
