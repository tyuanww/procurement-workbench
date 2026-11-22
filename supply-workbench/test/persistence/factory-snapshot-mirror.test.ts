import { entityId, orderLineId, type FactoryReportRow, type ImportBatch, type ImportRow } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { makeCommitImport } from '../../packages/application/src/imports/index.js';
import '../application/load-import-registry.js';
import { aUser, createMemory, FixedClock } from '../../packages/testkit/src/index.js';

const AT = '2026-10-12T00:00:00.000Z';

it('工厂快照提交：unchanged 行写入新活动快照成为全量镜像，skip 行仍跳过', async () => {
  const memory = createMemory();
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock: new FixedClock(AT) });
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'] });

  // 首份文件：两行都是 create。
  await memory.stores.imports.save(batch('factory-b1', 'file-sha-1'));
  await memory.stores.imports.saveRow(row({ id: 'b1-r1', batchId: 'factory-b1', rowNo: 2, action: 'create', fingerprint: 'ship:2' }));
  await memory.stores.imports.saveRow(row({ id: 'b1-r2', batchId: 'factory-b1', rowNo: 3, action: 'create', fingerprint: 'ship:3' }));
  await commit({ importBatchId: 'factory-b1' }, actor);
  expect(reportsOf(memory, 'factory-b1')).toHaveLength(2);
  expect((await memory.stores.imports.get('factory-b1')).supersededAt).toBeNull();

  // 首份快照里把第 2 行关联到订单行，重导后 unchanged 行必须沿用这个关联，已交量才不会重新缺失。
  const linked = await memory.stores.factoryReports.get('b1-r1:report');
  await memory.stores.factoryReports.save({ ...linked, linkedOrderLineId: orderLineId('line-1'), linkStatus: 'linked', linkReason: null });

  // 同内容不同 SHA 的二次导入：diff 把两行都标成 unchanged，旧快照在提交时被退休。
  await memory.stores.imports.save(batch('factory-b2', 'file-sha-2'));
  await memory.stores.imports.saveRow(row({ id: 'b2-r1', batchId: 'factory-b2', rowNo: 2, action: 'unchanged', fingerprint: 'ship:2' }));
  await memory.stores.imports.saveRow(row({ id: 'b2-r2', batchId: 'factory-b2', rowNo: 3, action: 'unchanged', fingerprint: 'ship:3' }));
  await commit({ importBatchId: 'factory-b2' }, actor);

  // 新活动快照必须是当前文件的全量镜像（2 行），历史行不删除。
  expect(reportsOf(memory, 'factory-b2')).toHaveLength(2);
  expect(reportsOf(memory, 'factory-b1')).toHaveLength(2);
  expect((await memory.stores.imports.get('factory-b1')).supersededAt).toBe(AT);
  expect((await memory.stores.imports.get('factory-b2')).supersededAt).toBeNull();
  const carried = await memory.stores.factoryReports.get('b2-r1:report');
  expect(carried.linkedOrderLineId).toBe(orderLineId('line-1'));
  expect(carried.linkStatus).toBe('linked');
  expect((await memory.stores.factoryReports.get('b2-r2:report')).linkStatus).toBe('unlinked');

  // 增量文件：1 行不变 + 1 行显式 skip。不变的行仍写进活动快照，skip 不写。
  await memory.stores.imports.save(batch('factory-b3', 'file-sha-3'));
  await memory.stores.imports.saveRow(row({ id: 'b3-r1', batchId: 'factory-b3', rowNo: 2, action: 'unchanged', fingerprint: 'ship:2' }));
  await memory.stores.imports.saveRow(row({ id: 'b3-r2', batchId: 'factory-b3', rowNo: 3, action: 'skip', fingerprint: 'ship:3' }));
  await memory.stores.imports.saveRow(row({ id: 'b3-r3', batchId: 'factory-b3', rowNo: 4, action: 'create', fingerprint: 'ship:4' }));
  await commit({ importBatchId: 'factory-b3' }, actor);

  expect(reportsOf(memory, 'factory-b3')).toHaveLength(2);
  expect(reportsOf(memory, 'factory-b3').map((report) => report.sheetName)).toEqual(['成品出货明细', '成品出货明细']);
  expect((await memory.stores.factoryReports.get('b3-r1:report')).linkedOrderLineId).toBe(orderLineId('line-1'));
  expect((await memory.stores.factoryReports.get('b3-r3:report')).linkStatus).toBe('unlinked');
  expect((await memory.stores.imports.get('factory-b3')).supersededAt).toBeNull();
});

function reportsOf(memory: ReturnType<typeof createMemory>, batchId: string): FactoryReportRow[] {
  return [...memory.box.current.factoryReports.values()].filter((report) => report.importBatchId === batchId);
}

function batch(id: string, fingerprint: string): ImportBatch {
  return {
    id: entityId(id), createdAt: AT, updatedAt: AT, fileId: entityId(fingerprint), template: 'factory-progress-v1', factoryPartyId: entityId('factory-a'),
    sourceKey: 'factory-progress-v1:factory-a', sourceFingerprint: fingerprint, effectiveAt: AT, supersededAt: null,
    status: 'parsed', coverage: 'full_snapshot', revision: 0, fileMeta: { fingerprints: [] }, stats: null,
    decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] }, createdBy: entityId('buyer-1'), committedBy: null, committedAt: null, rolledBackBy: null, rolledBackAt: null, error: null,
  };
}

function row(input: { readonly id: string; readonly batchId: string; readonly rowNo: number; readonly action: ImportRow['action']; readonly fingerprint: string }): ImportRow {
  return { id: entityId(input.id), importBatchId: entityId(input.batchId), sheetName: '成品出货明细', rowNo: input.rowNo, raw: {}, parsed: {}, issues: [], action: input.action, targetId: null, skipReason: input.action === 'skip' ? '用户跳过' : null };
}
