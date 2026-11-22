import { scopedProcurementDates } from '../../queries/plan/procurement-schedule.js';
import type { PlanStores, PlanUnitOfWork } from '../../../../application/src/ports/plan.js';
import type { AppDatabase } from '../../client.js';
import { requireDatabase } from '../../require-database.js';
import { auditRepository } from '../audit-log.js';
import { placeholderStores } from '../index.js';
import { deliveryBatchRepository } from '../delivery-batches.js';
import { orderLineRepository } from '../order-lines.js';
import { workItemDependencyRepository, workItemEventRepository, workItemRepository } from './work-items.js';
import { createUnitOfWork } from '../../unit-of-work.js';

/** 计划写和订单写共用同一个 UnitOfWork，计划事务里自带 audit。 */
export function planUnitOfWork(db: AppDatabase): PlanUnitOfWork {
  return createUnitOfWork(db, (tx) => storesOf(tx));
}

function storesOf(tx: unknown): PlanStores {
  const db = requireDatabase(tx);
  return {
    ...placeholderStores(),
    procurementDates: (query) => scopedProcurementDates(db, query),
    workItems: workItemRepository(db),
    workItemEvents: workItemEventRepository(db),
    workItemDependencies: workItemDependencyRepository(db),
    batches: deliveryBatchRepository(db),
    orderLines: orderLineRepository(db),
    audit: auditRepository(db),
  };
}
