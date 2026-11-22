import { makeGetBuyerLoad, makeGetStuckBatches, makeGetSupplierPerformance } from '@sw/application';
import type { LocalDate } from '@sw/domain';
import { bottleneckSummary, performanceQueries, type AppDatabase } from '@sw/persistence';
import { systemClock } from '../system/clock.js';
import type { PerformanceApi } from '../http/performance/routes.js';

type Clock = { now(): string; today(): LocalDate };

export function register(): never {
  throw new Error('看板路由由 buildHttpApp 挂载');
}

export function composePerformance(input: { readonly db: AppDatabase; readonly timeZone: string; readonly clock?: Clock }): PerformanceApi {
  const clock = input.clock ?? systemClock(input.timeZone);
  const performance = performanceQueries({ db: input.db, clock, timeZone: input.timeZone });
  return {
    getStuck: makeGetStuckBatches({ performance }),
    getSuppliers: makeGetSupplierPerformance({ performance }),
    getBuyers: makeGetBuyerLoad({ performance }),
    getBottlenecks: async () => bottleneckSummary(input.db, clock.today()),
  };
}
