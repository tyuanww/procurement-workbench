import { entityId, orderLineId, type ImportBatch, type ImportRow } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { readCsv } from '../../packages/importers/src/workbook/index.js';
import { template } from '../../packages/importers/src/templates/owner-map-v1/index.js';
import { importRowsOf } from '../../packages/application/src/imports/use-cases/parse-batch.js';
import { commitOwnerMap } from '../../packages/application/src/imports/commit/owner-map-v1.js';
import { makeCommitImport } from '../../packages/application/src/imports/index.js';
import './load-import-registry.js';
import { applyOwnerAssignment } from '../../packages/application/src/shared/owner-assignment.js';
import type { Actor } from '../../packages/application/src/shared/actor.js';
import { anOrderLine, aPurchaseOrder, aUser, FixedClock } from '../../packages/testkit/src/index.js';
import { createPgFixture, type PgFixture } from './pg-fixtures.js';

const AT = '2026-11-09T00:00:00.000Z';
const HEADER = ['采购订单号', '负责人'] as const;
const admin = (): Actor => ({ id: entityId('admin-1'), name: '管理员', roles: ['admin'] });
const EMPTY_EXISTING = { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] };

it('唯一负责人写 assigned 并同步 buyer_user_id，返回受影响的订单行', async () => {
  const fixture = await createPgFixture();
  try {
    await seed(fixture);
    const rows = parsedRows([['PO20261012000001', '采购甲']]);
    const result = await fixture.uow.run((tx) => commitOwnerMap({ tx, batch: batchOf('batch-1'), rows, at: AT, actor: admin() }));
    expect([...result.affectedLineIds].sort()).toEqual(['line-a', 'line-b']);
    expect(result.presentLineIds).toEqual([]);
    const owners = await rowsOf(fixture.handle.exec("select subject_id, status, owner_user_id, owner_name_raw, source, source_ref from owner_assignments order by subject_id"));
    expect(owners).toEqual([
      { subject_id: 'line-a', status: 'assigned', owner_user_id: 'user-a', owner_name_raw: '采购甲', source: 'mapping_import', source_ref: 'batch-1' },
      { subject_id: 'line-b', status: 'assigned', owner_user_id: 'user-a', owner_name_raw: '采购甲', source: 'mapping_import', source_ref: 'batch-1' },
    ]);
    expect(await buyerOf(fixture, 'line-a')).toBe('user-a');
    expect(await buyerOf(fixture, 'line-b')).toBe('user-a');
  } finally {
    await fixture.handle.close();
  }
});

it('未知负责人和重名进 pending，离职用户不算匹配，不写假负责人', async () => {
  const fixture = await createPgFixture();
  try {
    await seed(fixture);
    await commitMapping({ fixture, batchId: 'batch-1', lines: [
      ['PO20261012000002', '查无此人'],
      ['PO20261012000003', '重名采购'],
      ['PO20261012000006', '离职采购'],
    ] });
    const pending = await rowsOf(fixture.handle.exec("select subject_id, owner_user_id, owner_name_raw, source from owner_assignments where status = 'pending' order by subject_id"));
    expect(pending).toEqual([
      { subject_id: 'line-c', owner_user_id: null, owner_name_raw: '查无此人', source: 'mapping_import' },
      { subject_id: 'line-d', owner_user_id: null, owner_name_raw: '重名采购', source: 'mapping_import' },
      { subject_id: 'line-g', owner_user_id: null, owner_name_raw: '离职采购', source: 'mapping_import' },
    ]);
    expect(await buyerOf(fixture, 'line-d')).toBeNull();
    expect(await buyerOf(fixture, 'line-c')).toBeNull();
  } finally {
    await fixture.handle.close();
  }
});

it('零匹配 pending 不覆盖已有手工负责人，空负责人行跳过', async () => {
  const fixture = await createPgFixture();
  try {
    await seed(fixture);
    await fixture.uow.run(async (tx) => {
      const line = await tx.orderLines.get(orderLineId('line-f'));
      await applyOwnerAssignment({ tx, nextId: () => entityId('manual-assignment'), at: AT, line, desired: { status: 'assigned', ownerUserId: entityId('user-b'), ownerNameRaw: '采购乙', source: 'manual', sourceRef: null } });
    });
    await commitMapping({ fixture, batchId: 'batch-1', lines: [
      ['PO20261012000005', '查无此人'],
      ['PO20261012000006', ''],
    ] });
    const owners = await rowsOf(fixture.handle.exec("select subject_id, status, owner_user_id, owner_name_raw, source from owner_assignments where subject_id = 'line-f'"));
    expect(owners).toEqual([{ subject_id: 'line-f', status: 'assigned', owner_user_id: 'user-b', owner_name_raw: '采购乙', source: 'manual' }]);
    expect(await buyerOf(fixture, 'line-f')).toBe('user-b');
    expect(await rowsOf(fixture.handle.exec("select id from owner_assignments where subject_id = 'line-g'"))).toHaveLength(0);
  } finally {
    await fixture.handle.close();
  }
});

it('同一映射重复提交幂等：不新增记录，不重复写 buyer_user_id', async () => {
  const fixture = await createPgFixture();
  try {
    await seed(fixture);
    const mapping = [['PO20261012000001', '采购甲'], ['PO20261012000003', '重名采购']] as const;
    await commitMapping({ fixture, batchId: 'batch-1', lines: mapping });
    await commitMapping({ fixture, batchId: 'batch-2', lines: mapping });
    expect(await rowsOf(fixture.handle.exec("select id from owner_assignments where subject_id = 'line-a'"))).toHaveLength(1);
    expect(await rowsOf(fixture.handle.exec("select id from owner_assignments where subject_id = 'line-d'"))).toHaveLength(1);
    expect(await rowsOf(fixture.handle.exec('select id from owner_assignments where superseded_at is not null'))).toHaveLength(0);
    expect(await buyerOf(fixture, 'line-a')).toBe('user-a');
  } finally {
    await fixture.handle.close();
  }
});

async function commitMapping(input: { readonly fixture: PgFixture; readonly batchId: string; readonly lines: readonly (readonly [string, string])[] }): Promise<void> {
  const parsed = template.diff(template.parse(bookOf(input.lines), ctx()), EMPTY_EXISTING);
  await input.fixture.uow.run(async (tx) => {
    await tx.imports.save(batchOf(input.batchId));
    for (const row of importRowsOf({ batchId: entityId(input.batchId), parsed, ids: { next: nextRowId() } })) await tx.imports.saveRow(row);
  });
  await makeCommitImport({ uow: input.fixture.uow, clock: new FixedClock(AT) })({ importBatchId: input.batchId }, admin());
}

function parsedRows(lines: readonly (readonly [string, string])[]): readonly ImportRow[] {
  const parsed = template.diff(template.parse(bookOf(lines), ctx()), EMPTY_EXISTING);
  return importRowsOf({ batchId: entityId('batch-1'), parsed, ids: { next: nextRowId() } });
}

function nextRowId(): () => ReturnType<typeof entityId> {
  let sequence = 1;
  return () => {
    sequence += 1;
    return entityId(`row-${sequence}`);
  };
}

function bookOf(lines: readonly (readonly string[])[]) {
  const text = [HEADER, ...lines].map((line) => line.join(',')).join('\n');
  return readCsv(new TextEncoder().encode(text), 'owner-map.csv');
}

function ctx() {
  return { uploadedAt: AT, factoryPartyId: null };
}

function batchOf(id: string): ImportBatch {
  return {
    id: entityId(id),
    createdAt: AT,
    updatedAt: AT,
    fileId: entityId('file-1'),
    template: 'owner-map-v1',
    factoryPartyId: null,
    status: 'parsed',
    fileMeta: {},
    stats: {},
    decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] },
    createdBy: entityId('admin-1'),
    committedBy: null,
    committedAt: null,
    rolledBackBy: null,
    rolledBackAt: null,
    error: null,
  };
}

async function seed(fixture: PgFixture): Promise<void> {
  await fixture.uow.run(async (tx) => {
    await tx.users.save(aUser({ id: entityId('user-a'), name: '采购甲', roles: ['buyer'] }));
    await tx.users.save(aUser({ id: entityId('user-b'), name: '采购乙', roles: ['buyer'] }));
    await tx.users.save(aUser({ id: entityId('user-dup-1'), name: '重名采购', roles: ['buyer'] }));
    await tx.users.save(aUser({ id: entityId('user-dup-2'), name: '重名采购', roles: ['buyer'] }));
    await tx.users.save(aUser({ id: entityId('user-gone'), name: '离职采购', roles: ['buyer'], active: false }));
    for (let index = 1; index <= 6; index += 1) {
      const poNorm = `PO2026101200000${index}`;
      await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId(`po-${index}`), poRaw: poNorm, poNorm }));
    }
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-a'), purchaseOrderId: entityId('po-1'), buyerUserId: null }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-b'), purchaseOrderId: entityId('po-1'), buyerUserId: null }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-c'), purchaseOrderId: entityId('po-2'), buyerUserId: null }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-d'), purchaseOrderId: entityId('po-3'), buyerUserId: null }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-e'), purchaseOrderId: entityId('po-4'), buyerUserId: null }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-f'), purchaseOrderId: entityId('po-5'), buyerUserId: null }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-g'), purchaseOrderId: entityId('po-6'), buyerUserId: null }));
  });
}

async function buyerOf(fixture: PgFixture, lineId: string): Promise<string | null> {
  return (await fixture.uow.run((tx) => tx.orderLines.get(orderLineId(lineId)))).buyerUserId;
}

async function rowsOf(input: unknown | Promise<unknown>): Promise<readonly Record<string, unknown>[]> {
  const result = await input;
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter((row: unknown): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
