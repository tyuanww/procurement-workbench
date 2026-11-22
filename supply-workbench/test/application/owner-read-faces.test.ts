import { entityId, orderLineId } from '../../packages/domain/src/index.js';
import type { Actor } from '../../packages/application/src/shared/actor.js';
import { makeAssignOwner } from '../../packages/application/src/owner/index.js';
import { bottleneckSummary } from '../../packages/persistence/src/queries/performance/bottlenecks.js';
import { followUpQueries } from '../../packages/persistence/src/queries/follow-up/index.js';
import { aPurchaseOrder, aUser, anOrderLine, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import { expect, it } from 'vitest';
import { createPgFixture, queriesOf, type PgFixture } from './pg-fixtures.js';

const at = '2026-11-09T00:00:00.000Z';
const today = '2026-11-09';

it('改负责人后看板缺负责人、覆盖率、跟进台三个读面一致', async () => {
  const fixture = await createPgFixture();
  try {
    await seedLines(fixture);
    expect(await faces(fixture)).toEqual({ missingOwner: 1, coverage: { total: 1, assigned: 0, unassigned: 1, pending: 0 }, buyerId: null });

    await makeAssignOwner(depsOf(fixture))({ lineIds: ['line-1'], ownerUserId: 'user-buyer-a' }, actor('admin-1', ['admin']));
    expect(await faces(fixture)).toEqual({ missingOwner: 0, coverage: { total: 1, assigned: 1, unassigned: 0, pending: 0 }, buyerId: 'user-buyer-a' });

    await makeAssignOwner(depsOf(fixture))({ lineIds: ['line-1'], ownerUserId: 'user-buyer-b' }, actor('admin-1', ['admin']));
    expect(await faces(fixture)).toEqual({ missingOwner: 0, coverage: { total: 1, assigned: 1, unassigned: 0, pending: 0 }, buyerId: 'user-buyer-b' });
  } finally {
    await fixture.handle.close();
  }
});

async function faces(fixture: PgFixture) {
  const bottleneck = await bottleneckSummary(fixture.handle.db, today);
  const coverage = await queriesOf(fixture).owners.coverage({});
  const lines = await followUpQueries({ db: fixture.handle.db, clock: new FixedClock(at), timeZone: 'Asia/Shanghai' }).list({ page: 1, pageSize: 10 });
  return {
    missingOwner: bottleneck.categories.find((category) => category.key === 'missing_owner')?.count ?? -1,
    coverage,
    buyerId: lines.items[0]?.buyer?.id ?? null,
  };
}

async function seedLines(fixture: PgFixture): Promise<void> {
  await fixture.uow.run(async (tx) => {
    await tx.users.save(aUser({ id: entityId('user-buyer-a'), name: '采购甲', roles: ['buyer'] }));
    await tx.users.save(aUser({ id: entityId('user-buyer-b'), name: '采购乙', roles: ['buyer'] }));
    await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-1'), poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER' }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-1'), purchaseOrderId: entityId('po-1') }));
  });
}

function depsOf(fixture: PgFixture) {
  return { uow: fixture.uow, clock: new FixedClock(at), ids: new SequentialIds() };
}

function actor(id: string, roles: Actor['roles']): Actor {
  return { id: entityId(id), name: id, roles };
}
