import { entityId, type ImportBatch, type ImportRow } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { makeCommitImport } from '../../packages/application/src/imports/index.js';
import './load-import-registry.js';
import { aUser, createMemory, FixedClock } from '../../packages/testkit/src/index.js';

const at = '2026-10-12T00:00:00.000Z';

function batch(id: string, fingerprint: string): ImportBatch {
  return {
    id: entityId(id), createdAt: at, updatedAt: at, fileId: entityId(fingerprint), template: 'factory-progress-v1', factoryPartyId: entityId('factory-a'),
    sourceKey: 'factory-progress-v1:factory-a', sourceFingerprint: fingerprint, effectiveAt: at, supersededAt: null,
    status: 'parsed', coverage: 'full_snapshot', revision: 0, fileMeta: null, stats: null,
    decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] }, createdBy: entityId('buyer-1'), committedBy: null, committedAt: null, rolledBackBy: null, rolledBackAt: null, error: null,
  };
}

function row(id: string, batchId: string): ImportRow {
  return { id: entityId(id), importBatchId: entityId(batchId), sheetName: '成品出货明细', rowNo: 2, raw: {}, parsed: {}, issues: [], action: 'create', targetId: null, skipReason: null };
}

it('工厂快照提交会退休旧来源，重复 fingerprint 不重复写入', async () => {
  const memory = createMemory();
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock: new FixedClock(at) });
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'] });

  await memory.stores.imports.save(batch('factory-b1', 'fp-1'));
  await memory.stores.imports.saveRow(row('factory-r1', 'factory-b1'));
  await commit({ importBatchId: 'factory-b1' }, actor);

  await memory.stores.imports.save(batch('factory-b2', 'fp-2'));
  await memory.stores.imports.saveRow(row('factory-r2', 'factory-b2'));
  await commit({ importBatchId: 'factory-b2' }, actor);
  expect((await memory.stores.imports.get('factory-b1')).supersededAt).toBe(at);
  expect((await memory.stores.imports.get('factory-b2')).supersededAt).toBeNull();
  expect((await memory.stores.factoryReports.listByCodeNorm(''))).toHaveLength(0);

  await memory.stores.imports.save(batch('factory-b3', 'fp-2'));
  await memory.stores.imports.saveRow(row('factory-r3', 'factory-b3'));
  await commit({ importBatchId: 'factory-b3' }, actor);
  expect((await memory.stores.imports.get('factory-b3')).status).toBe('discarded');
  expect((await memory.stores.imports.get('factory-b3')).error).toContain('factory-b2');
  expect([...memory.box.current.factoryReports.values()]).toHaveLength(2);
});

