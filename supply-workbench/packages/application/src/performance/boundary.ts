import type { Actor } from '../shared/actor.js';
import type { PerformanceReadModel } from '../ports/performance-read-model.js';
import type {
  BuyerLoadDashboard,
  BuyerLoadQuery,
  StuckDashboard,
  StuckQuery,
  SupplierDashboard,
  SupplierQuery,
} from './views.js';

export type * from './views.js';

export type GetStuckBatchesDeps = { readonly performance: PerformanceReadModel };
export type GetStuckBatches = (input: StuckQuery, actor: Actor) => Promise<StuckDashboard>;
export type GetSupplierPerformanceDeps = { readonly performance: PerformanceReadModel };
export type GetSupplierPerformance = (input: SupplierQuery, actor: Actor) => Promise<SupplierDashboard>;
export type GetBuyerLoadDeps = { readonly performance: PerformanceReadModel };
export type GetBuyerLoad = (input: BuyerLoadQuery, actor: Actor) => Promise<BuyerLoadDashboard>;
