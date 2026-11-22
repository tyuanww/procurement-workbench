import {
  makeAssignOwner,
  makeGetOwnerCoverage,
  makeListPendingOwners,
  makeResolvePendingOwner,
} from '@sw/application';
import {
  auditRepository,
  createUnitOfWork,
  orderLineRepository,
  ownerAssignmentRepository,
  ownerQueries,
  placeholderStores,
  requireDatabase,
  userRepository,
  type AppDatabase,
} from '@sw/persistence';
import { systemClock } from '../system/clock.js';
import { systemIds } from '../system/ids.js';
import type { OwnerApi } from '../http/owner/api.js';

export function register(): never {
  throw new Error('负责人路由由 buildHttpApp 挂载');
}

export function composeOwner(input: { readonly db: AppDatabase; readonly timeZone: string }): OwnerApi {
  const clock = systemClock(input.timeZone);
  const owners = ownerQueries(input.db);
  const uow = createUnitOfWork(input.db, (tx) => {
    const db = requireDatabase(tx);
    return {
      ...placeholderStores(),
      users: userRepository(db),
      orderLines: orderLineRepository(db),
      audit: auditRepository(db),
      ownerAssignments: ownerAssignmentRepository(db),
    };
  });
  return {
    coverage: makeGetOwnerCoverage({ owners }),
    pending: makeListPendingOwners({ owners }),
    assign: makeAssignOwner({ uow, clock, ids: systemIds() }),
    resolve: makeResolvePendingOwner({ uow, clock, ids: systemIds() }),
  };
}
