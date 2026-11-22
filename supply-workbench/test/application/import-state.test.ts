import { expect, it } from 'vitest';
import { entityId } from '../../packages/domain/src/index.js';
import { makeDiscardImport, makeSaveImportDecisions } from '../../packages/application/src/imports/index.js';
import { aUser, createMemory, FixedClock } from '../../packages/testkit/src/index.js';
import type { ImportBatch } from '../../packages/domain/src/index.js';

const at = '2026-10-12T00:00:00.000Z';

function batch(status: ImportBatch['status'] = 'parsed'): ImportBatch {
  return {
    id: entityId('batch-state'),
    createdAt: at,
    updatedAt: at,
    fileId: entityId('file-state'),
    template: 'po-master-v1',
    factoryPartyId: null,
    status,
    fileMeta: {},
    stats: {},
    decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] },
    createdBy: entityId('buyer-1'),
    committedBy: status === 'committed' ? entityId('buyer-1') : null,
    committedAt: status === 'committed' ? at : null,
    rolledBackBy: null,
    rolledBackAt: null,
    error: null,
  };
}

const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'] });

it('已提交导入不能再次放弃，也不会写审计', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('committed'));
  await expect(makeDiscardImport({ uow: memory.unitOfWork, clock: new FixedClock(at) })({ importBatchId: 'batch-state' }, actor)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  expect(memory.box.current.audit).toHaveLength(0);
});

it('放弃后的批次不能保存冲突决策', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('discarded'));
  await expect(makeSaveImportDecisions({ uow: memory.unitOfWork, clock: new FixedClock(at) })({ importBatchId: 'batch-state', decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] } }, actor)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  expect(memory.box.current.audit).toHaveLength(0);
});

it('过期 revision 拒绝写入且不覆盖批次', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch());
  await expect(makeDiscardImport({ uow: memory.unitOfWork, clock: new FixedClock(at) })({ importBatchId: 'batch-state', expectedRevision: 1 }, actor)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  expect((await memory.stores.imports.get('batch-state')).status).toBe('parsed');
});
