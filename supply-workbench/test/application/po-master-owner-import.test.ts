import { entityId } from '../../packages/domain/src/index.js';
import type { ImportBatch } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { readCsv } from '../../packages/importers/src/workbook/index.js';
import { REQUIRED_COLUMNS } from '../../packages/importers/src/templates/po-master-v1/columns.js';
import { template } from '../../packages/importers/src/templates/po-master-v1/index.js';
import type { ParsedRow, PoMasterPayload } from '../../packages/application/src/ports/parsed-rows.js';
import { makeCommitImport } from '../../packages/application/src/imports/index.js';
import './load-import-registry.js';
import type { Actor } from '../../packages/application/src/shared/actor.js';
import { aParty, aUser, FixedClock } from '../../packages/testkit/src/index.js';
import { createPgFixture, queriesOf, type PgFixture } from './pg-fixtures.js';

const at = '2026-11-09T00:00:00.000Z';
const admin = (): Actor => ({ id: entityId('admin-1'), name: '管理员', roles: ['admin'] });

const baseRow: Readonly<Record<string, string>> = {
  供应商: '甲代工厂',
  产品名称: '海葡萄水光冰冰贴',
  产品条码: '2000000003023',
  订单数量: '10',
  采购订单号: 'PO-2026-1',
  状态: '进行中',
};

it('PO 总表带采购负责人和工厂列，提交后写负责人归属和工厂关联', async () => {
  const fixture = await createPgFixture();
  try {
    await seed(fixture);
    await commitWith(fixture, { 采购负责人: '采购甲', 工厂: '甲代工厂' });
    const lineId = entityId('row-2:line');
    expect(await lineBuyer(fixture, lineId)).toBe('user-buyer-a');
    const owner = rowsOf(await fixture.handle.exec(`select status, owner_user_id, owner_name_raw, source, source_ref from owner_assignments where subject_id = 'row-2:line'`));
    expect(owner).toHaveLength(1);
    expect(owner[0]).toMatchObject({ status: 'assigned', owner_user_id: 'user-buyer-a', owner_name_raw: '采购甲', source: 'po_master', source_ref: 'batch-1' });
    const link = rowsOf(await fixture.handle.exec(`select factory_party_id, status, source, confidence from line_factory_links where order_line_id = 'row-2:line'`));
    expect(link[0]).toMatchObject({ factory_party_id: 'factory-1', status: 'linked', source: 'po_master', confidence: 'column' });
    expect(await queriesOf(fixture).owners.coverage({})).toMatchObject({ total: 1, assigned: 1, unassigned: 0, pending: 0 });
  } finally {
    await fixture.handle.close();
  }
});

it('未知负责人进 pending，不写假负责人；未知工厂写未关联原因', async () => {
  const fixture = await createPgFixture();
  try {
    await seed(fixture);
    await commitWith(fixture, { 采购负责人: '查无此人', 工厂: '不存在的工厂' });
    expect(await lineBuyer(fixture, entityId('row-2:line'))).toBeNull();
    const owner = rowsOf(await fixture.handle.exec(`select status, owner_user_id, owner_name_raw from owner_assignments where subject_id = 'row-2:line'`));
    expect(owner[0]).toMatchObject({ status: 'pending', owner_user_id: null, owner_name_raw: '查无此人' });
    expect(await queriesOf(fixture).owners.coverage({})).toMatchObject({ total: 1, assigned: 0, unassigned: 0, pending: 1 });
    const link = rowsOf(await fixture.handle.exec(`select factory_party_id, status, reason from line_factory_links where order_line_id = 'row-2:line'`));
    expect(link[0]).toMatchObject({ factory_party_id: null, status: 'unlinked', reason: 'FACTORY_NAME_NOT_FOUND' });
  } finally {
    await fixture.handle.close();
  }
});

it('负责人重名时进 pending，不替用户选人', async () => {
  const fixture = await createPgFixture();
  try {
    await seed(fixture, [
      aUser({ id: entityId('user-dup-1'), name: '重名采购', roles: ['buyer'] }),
      aUser({ id: entityId('user-dup-2'), name: '重名采购', roles: ['buyer'] }),
    ]);
    await commitWith(fixture, { 采购负责人: '重名采购' });
    expect(await lineBuyer(fixture, entityId('row-2:line'))).toBeNull();
    const owner = rowsOf(await fixture.handle.exec(`select status, owner_user_id, owner_name_raw from owner_assignments where subject_id = 'row-2:line'`));
    expect(owner[0]).toMatchObject({ status: 'pending', owner_user_id: null, owner_name_raw: '重名采购' });
  } finally {
    await fixture.handle.close();
  }
});

it('没有可选列时提交行为不变，不写负责人和工厂关联', async () => {
  const fixture = await createPgFixture();
  try {
    await seed(fixture);
    await commitWith(fixture, {});
    expect(rowsOf(await fixture.handle.exec(`select id from owner_assignments`))).toHaveLength(0);
    expect(rowsOf(await fixture.handle.exec(`select id from line_factory_links`))).toHaveLength(0);
    expect(await lineBuyer(fixture, entityId('row-2:line'))).toBeNull();
  } finally {
    await fixture.handle.close();
  }
});

async function seed(fixture: PgFixture, extraUsers: readonly ReturnType<typeof aUser>[] = []): Promise<void> {
  await fixture.uow.run(async (tx) => {
    await tx.users.save(aUser({ id: entityId('user-buyer-a'), name: '采购甲', roles: ['buyer'] }));
    for (const user of extraUsers) await tx.users.save(user);
    await tx.parties.save(aParty({ id: entityId('factory-1'), displayName: '甲代工厂', isSupplier: true, isFactory: true }));
  });
}

async function commitWith(fixture: PgFixture, optional: Readonly<Record<string, string>>): Promise<void> {
  const parsed = template.parse(bookOf(optional), { uploadedAt: at, factoryPartyId: null });
  const batch = batchOf('batch-1');
  await fixture.uow.run(async (tx) => {
    await tx.imports.save(batch);
    for (const row of importRowsOf({ batchId: 'batch-1', rows: parsed.rows })) await tx.imports.saveRow(row);
  });
  await makeCommitImport({ uow: fixture.uow, clock: new FixedClock(at) })({ importBatchId: 'batch-1' }, admin());
}

function bookOf(optional: Readonly<Record<string, string>>) {
  const headers = [...REQUIRED_COLUMNS, ...Object.keys(optional)];
  const text = [headers.join(','), headers.map((header) => (header in optional ? optional[header] : baseRow[header]) ?? '').join(',')].join('\n');
  return readCsv(new TextEncoder().encode(text), 'po-master-optional.csv');
}

function batchOf(id: string): ImportBatch {
  return {
    id: entityId(id),
    createdAt: at,
    updatedAt: at,
    fileId: entityId('file-1'),
    template: 'po-master-v1',
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

function importRowsOf(input: { readonly batchId: string; readonly rows: readonly ParsedRow<PoMasterPayload>[] }) {
  return input.rows.map((row) => ({
    id: entityId(`row-${row.rowNo}`),
    importBatchId: entityId(input.batchId),
    sheetName: row.sheetName,
    rowNo: row.rowNo,
    raw: {},
    parsed: row.payload,
    issues: row.issues,
    action: 'create' as const,
    targetId: null,
    skipReason: null,
  }));
}

async function lineBuyer(fixture: PgFixture, lineId: string): Promise<string | null> {
  return (await fixture.uow.run((tx) => tx.orderLines.get(lineId))).buyerUserId;
}

function rowsOf(result: unknown): readonly Record<string, unknown>[] {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter((row: unknown): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
