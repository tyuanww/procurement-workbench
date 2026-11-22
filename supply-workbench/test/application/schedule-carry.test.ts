import { entityId, orderLineId, type ImportBatch, type ImportRow } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { makeCommitImport } from '../../packages/application/src/imports/index.js';
import './load-import-registry.js';
import { aUser, createMemory, FixedClock } from '../../packages/testkit/src/index.js';

const AT = '2026-10-12T00:00:00.000Z';

it('同一工厂的下一活动快照按指纹继承，不串日期，也不拿别的工厂或已退休快照', async () => {
  const memory = createMemory();
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock: new FixedClock(AT) });
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'] });
  const days = [listed('day-1'), listed('day-2')];
  await memory.stores.imports.save(batch({ id: 'factory-a1', file: 'sha-a1', party: 'factory-a', fingerprints: days }));
  await memory.stores.imports.saveRow(scheduleRow({ id: 'a1-d1', batchId: 'factory-a1', fingerprint: 'day-1' }));
  await memory.stores.imports.saveRow(scheduleRow({ id: 'a1-d2', batchId: 'factory-a1', fingerprint: 'day-2' }));
  await commit({ importBatchId: 'factory-a1' }, actor);
  await memory.stores.factoryReports.save({ ...(await memory.stores.factoryReports.get('a1-d1:report')), linkedOrderLineId: orderLineId('line-1'), linkStatus: 'linked', linkReason: null });
  await memory.stores.factoryReports.save({ ...(await memory.stores.factoryReports.get('a1-d2:report')), linkedOrderLineId: orderLineId('line-1'), linkStatus: 'manual', linkReason: null });

  await memory.stores.imports.save(batch({ id: 'factory-a2', file: 'sha-a2', party: 'factory-a', fingerprints: days }));
  await memory.stores.imports.saveRow(scheduleRow({ id: 'a2-d1', batchId: 'factory-a2', fingerprint: 'day-1', action: 'unchanged' }));
  await memory.stores.imports.saveRow(scheduleRow({ id: 'a2-d2', batchId: 'factory-a2', fingerprint: 'day-2', action: 'unchanged' }));
  await commit({ importBatchId: 'factory-a2' }, actor);
  expect((await memory.stores.factoryReports.get('a2-d1:report')).linkStatus).toBe('linked');
  expect((await memory.stores.factoryReports.get('a2-d1:report')).fingerprint).toBe('day-1');
  expect((await memory.stores.factoryReports.get('a2-d2:report')).linkStatus).toBe('manual');
  expect((await memory.stores.factoryReports.get('a2-d2:report')).fingerprint).toBe('day-2');
  expect((await memory.stores.imports.get('factory-a1')).supersededAt).toBe(AT);

  await memory.stores.imports.save(batch({ id: 'factory-b1', file: 'sha-b1', party: 'factory-b', fingerprints: [listed('day-1')] }));
  await memory.stores.imports.saveRow(scheduleRow({ id: 'b1-d1', batchId: 'factory-b1', fingerprint: 'day-1', action: 'unchanged' }));
  await commit({ importBatchId: 'factory-b1' }, actor);
  expect((await memory.stores.factoryReports.get('b1-d1:report')).linkStatus).toBe('unlinked');

  await memory.stores.imports.save(batch({ id: 'factory-a3', file: 'sha-a3', party: 'factory-a', fingerprints: [listed('day-1-qty-9')] }));
  await memory.stores.imports.saveRow(scheduleRow({ id: 'a3-qty', batchId: 'factory-a3', fingerprint: 'day-1-qty-9', action: 'create' }));
  await commit({ importBatchId: 'factory-a3' }, actor);
  expect((await memory.stores.factoryReports.get('a3-qty:report')).linkStatus).toBe('unlinked');
  expect((await memory.stores.factoryReports.get('a3-qty:report')).fingerprint).toBe('day-1-qty-9');
});

function listed(fingerprint: string) {
  return { sheet: '排产计划', rowNo: 8, fingerprint };
}

function batch(input: { readonly id: string; readonly file: string; readonly party: string; readonly fingerprints: readonly { readonly sheet: string; readonly rowNo: number; readonly fingerprint: string }[] }): ImportBatch {
  return {
    id: entityId(input.id), createdAt: AT, updatedAt: AT, fileId: entityId(input.file), template: 'factory-progress-v1', factoryPartyId: entityId(input.party),
    sourceKey: `factory-progress-v1:${input.party}`, sourceFingerprint: input.file, effectiveAt: AT, supersededAt: null,
    status: 'parsed', coverage: 'full_snapshot', revision: 0,
    fileMeta: { fingerprints: input.fingerprints },
    stats: null, decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] },
    createdBy: entityId('buyer-1'), committedBy: null, committedAt: null, rolledBackBy: null, rolledBackAt: null, error: null,
  };
}

function scheduleRow(input: { readonly id: string; readonly batchId: string; readonly fingerprint: string; readonly action?: ImportRow['action'] }): ImportRow {
  const action = input.action ?? 'create';
  return {
    id: entityId(input.id), importBatchId: entityId(input.batchId), sheetName: '排产计划', rowNo: 8,
    raw: { fingerprint: input.fingerprint }, parsed: { fingerprint: input.fingerprint }, issues: [], action, targetId: null, skipReason: null,
  };
}
