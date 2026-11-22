import { makeProductDevelopment, makeProductDevelopmentRead } from '@sw/application';
import { productDevelopmentQueries, productDevelopmentUnitOfWork, type AppDatabase } from '@sw/persistence';
import { systemClock } from '../system/clock.js';
import { systemIds } from '../system/ids.js';

export type ProductDevelopmentApi = ReturnType<typeof makeProductDevelopment> & ReturnType<typeof makeProductDevelopmentRead>;

export function composeProductDevelopment({ db, timeZone, clock = systemClock(timeZone) }: {
  readonly db: AppDatabase; readonly timeZone: string; readonly clock?: ReturnType<typeof systemClock>;
}): ProductDevelopmentApi {
  return {
    ...makeProductDevelopmentRead({ queries: productDevelopmentQueries(db), clock }),
    ...makeProductDevelopment({ uow: productDevelopmentUnitOfWork(db), clock, ids: systemIds() }),
  };
}
