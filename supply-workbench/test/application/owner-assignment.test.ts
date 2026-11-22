import { entityId, orderLineId } from '../../packages/domain/src/index.js';
import type { Actor } from '../../packages/application/src/shared/actor.js';
import { expect, it } from 'vitest';
import { makeUpdateLine } from '../../packages/application/src/follow-up/index.js';
import { makeAssignOwner, makeGetOwnerCoverage, makeResolvePendingOwner, applyOwnerAssignment } from '../../packages/application/src/owner/index.js';
import { aPurchaseOrder, aUser, anOrderLine, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import { createPgFixture, queriesOf, type PgFixture } from './pg-fixtures.js';

const at = '2026-11-09T00:00:00.000Z';

it('手工指派写当前记录和 buyer_user_id，重指派只追加历史', async () => {
  const fixture = await createPgFixture();
  try {
    await seedLines(fixture, ['line-1', 'line-2']);
    const deps = depsOf(fixture);
    const admin = actor('admin-1', ['admin']);
    const coverageBefore = await queriesOf(fixture).owners.coverage({});
    expect(coverageBefore).toEqual({ total: 2, assigned: 0, unassigned: 2, pending: 0 });

    await makeAssignOwner(deps)({ lineIds: ['line-1', 'line-2'], ownerUserId: 'user-buyer-a' }, admin);
    expect((await fixture.uow.run((tx) => tx.orderLines.get('line-1'))).buyerUserId).toBe('user-buyer-a');
    expect((await fixture.uow.run((tx) => tx.orderLines.get('line-2'))).buyerUserId).toBe('user-buyer-a');
    expect(await queriesOf(fixture).owners.coverage({})).toEqual({ total: 2, assigned: 2, unassigned: 0, pending: 0 });
    const assignments = rowsOf(await fixture.handle.exec(`select subject_id from owner_assignments where owner_user_id = 'user-buyer-a' order by subject_id`));
    expect(assignments).toHaveLength(2);

    await makeAssignOwner(deps)({ lineIds: ['line-1'], ownerUserId: 'user-buyer-b' }, admin);
    expect((await fixture.uow.run((tx) => tx.orderLines.get('line-1'))).buyerUserId).toBe('user-buyer-b');
    const rows = await fixture.handle.exec(`select owner_user_id, superseded_at, source from owner_assignments where subject_id = 'line-1' order by created_at, id`);
    expect(rowsOf(rows)).toHaveLength(2);
    expect(rowsOf(rows)[0]?.superseded_at).not.toBeNull();
    expect(rowsOf(rows)[1]?.owner_user_id).toBe('user-buyer-b');
    expect(rowsOf(rows)[1]?.source).toBe('manual');
  } finally {
    await fixture.handle.close();
  }
});

it('buyer 只能改自己负责的行，admin 能改全部', async () => {
  const fixture = await createPgFixture();
  try {
    await seedLines(fixture, ['line-1', 'line-2']);
    const deps = depsOf(fixture);
    await makeAssignOwner(deps)({ lineIds: ['line-1'], ownerUserId: 'user-buyer-b' }, actor('admin-1', ['admin']));
    await expect(makeAssignOwner(deps)({ lineIds: ['line-1'], ownerUserId: 'user-buyer-a' }, actor('user-buyer-a', ['buyer']))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await makeAssignOwner(deps)({ lineIds: ['line-1'], ownerUserId: 'user-buyer-a' }, actor('admin-1', ['admin']));
    expect((await fixture.uow.run((tx) => tx.orderLines.get('line-1'))).buyerUserId).toBe('user-buyer-a');
    await makeAssignOwner(deps)({ lineIds: ['line-2'], ownerUserId: 'user-buyer-a' }, actor('user-buyer-a', ['buyer']));
    expect((await fixture.uow.run((tx) => tx.orderLines.get('line-2'))).buyerUserId).toBe('user-buyer-a');
  } finally {
    await fixture.handle.close();
  }
});

it('匹配不到的负责人进 pending，不写假负责人；解决后按映射来源归属', async () => {
  const fixture = await createPgFixture();
  try {
    await seedLines(fixture, ['line-1']);
    await fixture.uow.run(async (tx) => {
      const line = await tx.orderLines.get('line-1');
      await applyOwnerAssignment({
        tx,
        nextId: () => entityId('assign-pending-1'),
        at,
        line,
        desired: { status: 'pending', ownerUserId: null, ownerNameRaw: '查无此人', source: 'po_master', sourceRef: null },
      });
    });
    expect(await queriesOf(fixture).owners.coverage({})).toEqual({ total: 1, assigned: 0, unassigned: 0, pending: 1 });
    expect((await fixture.uow.run((tx) => tx.orderLines.get('line-1'))).buyerUserId).toBeNull();
    const pending = await queriesOf(fixture).owners.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ lineId: 'line-1', nameRaw: '查无此人', source: 'po_master' });

    await makeResolvePendingOwner(depsOf(fixture))({ ownerNameRaw: ' 查无此人 ', ownerUserId: 'user-buyer-a' }, actor('admin-1', ['admin']));
    expect(await queriesOf(fixture).owners.coverage({})).toEqual({ total: 1, assigned: 1, unassigned: 0, pending: 0 });
    expect((await fixture.uow.run((tx) => tx.orderLines.get('line-1'))).buyerUserId).toBe('user-buyer-a');
    const rows = rowsOf(await fixture.handle.exec(`select owner_user_id, source, superseded_at from owner_assignments where subject_id = 'line-1' order by created_at, id`));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.superseded_at).not.toBeNull();
    expect(rows[1]?.source).toBe('mapping_import');
  } finally {
    await fixture.handle.close();
  }
});

it('待审核的空归属可由采购认领，但无法用普通改派撤销', async () => {
  const fixture = await createPgFixture();
  try {
    const lineId = orderLineId('line-1');
    await seedLines(fixture, [lineId]);
    await fixture.uow.run(async (tx) => {
      const line = await tx.orderLines.get(lineId);
      await applyOwnerAssignment({
        tx, at, line, nextId: () => entityId('pending-legacy-owner'),
        desired: { status: 'pending', ownerUserId: null, ownerNameRaw: '待匹配采购', source: 'po_master', sourceRef: null },
      });
    });
    const buyer = actor('user-buyer-a', ['buyer']);
    const claimed = await makeUpdateLine(depsOf(fixture))({ lineId, buyerUserId: buyer.id }, buyer);
    expect(claimed.ownerUndo).toBeUndefined();
    expect(await fixture.uow.run((tx) => tx.orderLines.get(lineId))).toMatchObject({ buyerUserId: buyer.id });
    expect(await queriesOf(fixture).owners.pending()).toEqual([]);
  } finally {
    await fixture.handle.close();
  }
});

it('覆盖率对 buyer 只算自己的范围，admin 看全量', async () => {
  const fixture = await createPgFixture();
  try {
    await seedLines(fixture, ['line-1', 'line-2']);
    const deps = depsOf(fixture);
    await makeAssignOwner(deps)({ lineIds: ['line-1'], ownerUserId: 'user-buyer-a' }, actor('admin-1', ['admin']));
    await makeAssignOwner(deps)({ lineIds: ['line-2'], ownerUserId: 'user-buyer-b' }, actor('admin-1', ['admin']));
    const getCoverage = makeGetOwnerCoverage({ owners: queriesOf(fixture).owners });
    expect(await getCoverage({}, actor('user-buyer-a', ['buyer']))).toEqual({ total: 1, assigned: 1, unassigned: 0, pending: 0 });
    expect(await getCoverage({}, actor('admin-1', ['admin']))).toEqual({ total: 2, assigned: 2, unassigned: 0, pending: 0 });
    await expect(getCoverage({}, actor('user-manager', ['manager']))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  } finally {
    await fixture.handle.close();
  }
});

async function seedLines(fixture: PgFixture, lineIds: readonly string[]): Promise<void> {
  await fixture.uow.run(async (tx) => {
    await tx.users.save(aUser({ id: entityId('user-buyer-a'), name: '采购甲', roles: ['buyer'] }));
    await tx.users.save(aUser({ id: entityId('user-buyer-b'), name: '采购乙', roles: ['buyer'] }));
    await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-1'), poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER' }));
    for (const lineId of lineIds) {
      await tx.orderLines.save(anOrderLine({ id: orderLineId(lineId), purchaseOrderId: entityId('po-1') }));
    }
  });
}

function depsOf(fixture: PgFixture) {
  return { uow: fixture.uow, clock: new FixedClock(at), ids: new SequentialIds() };
}

function actor(id: string, roles: Actor['roles']): Actor {
  return { id: entityId(id), name: id, roles };
}

function rowsOf(result: unknown): readonly Record<string, unknown>[] {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter((row: unknown): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
