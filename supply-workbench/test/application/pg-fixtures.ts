import { createDb, type AppHandle } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { factoryLinkQueries } from '../../packages/persistence/src/queries/factory-links/index.js';
import { ownerQueries } from '../../packages/persistence/src/queries/owner/index.js';
import { aliasRepository, partyRepository } from '../../packages/persistence/src/repositories/parties.js';
import { auditRepository } from '../../packages/persistence/src/repositories/audit-log.js';
import { deliveryBatchRepository } from '../../packages/persistence/src/repositories/delivery-batches.js';
import { factoryReportRepository } from '../../packages/persistence/src/repositories/factory-reports.js';
import { importBatchRepository } from '../../packages/persistence/src/repositories/import-batches.js';
import { lineFactoryLinkRepository } from '../../packages/persistence/src/repositories/line-factory-links.js';
import { orderLineRepository } from '../../packages/persistence/src/repositories/order-lines.js';
import { ownerAssignmentRepository } from '../../packages/persistence/src/repositories/owner-assignments.js';
import { placeholderStores } from '../../packages/persistence/src/repositories/index.js';
import { purchaseOrderRepository } from '../../packages/persistence/src/repositories/purchase-orders.js';
import { userRepository } from '../../packages/persistence/src/repositories/users.js';
import { requireDatabase } from '../../packages/persistence/src/require-database.js';
import { createUnitOfWork } from '../../packages/persistence/src/unit-of-work.js';
import type { UnitOfWork } from '../../packages/application/src/ports/unit-of-work.js';

export type PgFixture = {
  readonly handle: AppHandle;
  readonly uow: UnitOfWork;
};

/** P1/P2 用例需要的真实仓储；其它 store 保持 placeholder。 */
export async function createPgFixture(): Promise<PgFixture> {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  const uow = createUnitOfWork(handle.db, (tx) => {
    const db = requireDatabase(tx);
    return {
      ...placeholderStores(),
      users: userRepository(db),
      parties: partyRepository(db),
      aliases: aliasRepository(db),
      purchaseOrders: purchaseOrderRepository(db),
      orderLines: orderLineRepository(db),
      imports: importBatchRepository(db),
      factoryReports: factoryReportRepository(db),
      batches: deliveryBatchRepository(db),
      audit: auditRepository(db),
      ownerAssignments: ownerAssignmentRepository(db),
      factoryLinks: lineFactoryLinkRepository(db),
    };
  });
  return { handle, uow };
}

export function queriesOf(fixture: PgFixture) {
  return {
    owners: ownerQueries(fixture.handle.db),
    links: factoryLinkQueries(fixture.handle.db),
  };
}
