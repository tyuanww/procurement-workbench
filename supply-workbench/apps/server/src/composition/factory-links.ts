import {
  makeBackfillSupplierParties,
  makeGetFactoryLinkCounts,
  makeGetLineFactoryLink,
  makeListUnmatchedFactoryRows,
  makeRelinkFactoryRows,
  makeRelinkScheduleCells,
  makeSetLineFactoryLink,
} from '@sw/application';
import {
  auditRepository,
  createUnitOfWork,
  factoryLinkQueries,
  factoryReportRepository,
  lineFactoryLinkRepository,
  orderLineRepository,
  partyRepository,
  placeholderStores,
  purchaseOrderRepository,
  requireDatabase,
  type AppDatabase,
} from '@sw/persistence';
import { systemClock } from '../system/clock.js';
import { systemIds } from '../system/ids.js';
import type { FactoryLinkApi } from '../http/factory-links/api.js';

export function register(): never {
  throw new Error('工厂关联路由由 buildHttpApp 挂载');
}

export function composeFactoryLinks(input: { readonly db: AppDatabase; readonly timeZone: string }): FactoryLinkApi {
  const clock = systemClock(input.timeZone);
  const links = factoryLinkQueries(input.db);
  const uow = createUnitOfWork(input.db, (tx) => {
    const db = requireDatabase(tx);
    return {
      ...placeholderStores(),
      parties: partyRepository(db),
      purchaseOrders: purchaseOrderRepository(db),
      orderLines: orderLineRepository(db),
      factoryReports: factoryReportRepository(db),
      factoryLinks: lineFactoryLinkRepository(db),
      audit: auditRepository(db),
    };
  });
  const write = { uow, clock, ids: systemIds() };
  return {
    counts: makeGetFactoryLinkCounts({ links }),
    unmatched: makeListUnmatchedFactoryRows({ links }),
    relink: makeRelinkFactoryRows({ ...write, links }),
    relinkSchedule: makeRelinkScheduleCells({ ...write, links }),
    backfillSuppliers: makeBackfillSupplierParties({ ...write, links }),
    getLine: makeGetLineFactoryLink({ links }),
    setLine: makeSetLineFactoryLink(write),
  };
}
