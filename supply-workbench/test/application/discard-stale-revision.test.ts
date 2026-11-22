import { entityId } from '../../packages/domain/src/index.js';
import type { ImportBatch } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { makeCommitImport, makeDiscardStaleImports } from '../../packages/application/src/imports/index.js';
import { aUser, createMemory, FixedClock } from '../../packages/testkit/src/index.js';
import './load-import-registry.js';

const at = '2026-10-12T00:00:00.000Z';
const staleAt = '2026-10-01T00:00:00.000Z';

function batch(): ImportBatch {
  return {
    id: entityId('stale-batch'),
    createdAt: staleAt,
    updatedAt: staleAt,
    fileId: entityId('file-1'),
    template: 'po-master-v1',
    factoryPartyId: null,
    status: 'parsed',
    revision: 0,
    fileMeta: null,
    stats: null,
    decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] },
    createdBy: entityId('buyer-1'),
    committedBy: null,
    committedAt: null,
    rolledBackBy: null,
    rolledBackAt: null,
    error: null,
  };
}

const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });

it('没满 7 天的已解析批次保持待提交，已提交的过期批次保持已提交', async () => {
  const memory = createMemory();
  const clock = new FixedClock(at);
  await memory.stores.imports.save({ ...batch(), id: entityId('young-batch'), createdAt: '2026-10-06T00:00:00.000Z' });
  await memory.stores.imports.save({ ...batch(), id: entityId('committed-old'), status: 'committed', revision: 1, committedAt: staleAt });
  const result = await makeDiscardStaleImports({ uow: memory.unitOfWork, clock })({}, actor);
  expect(result.discarded).toBe(0);
  expect((await memory.stores.imports.get('young-batch')).status).toBe('parsed');
  expect((await memory.stores.imports.get('committed-old')).status).toBe('committed');
});

it('刚好满 7 天的已解析批次放弃并推进修订号', async () => {
  const memory = createMemory();
  await memory.stores.imports.save({ ...batch(), createdAt: '2026-10-05T00:00:00.000Z' });
  const result = await makeDiscardStaleImports({ uow: memory.unitOfWork, clock: new FixedClock(at) })({}, actor);
  expect(result.discarded).toBe(1);
  expect((await memory.stores.imports.get('stale-batch')).status).toBe('discarded');
  expect((await memory.stores.imports.get('stale-batch')).revision).toBe(1);
});

it('过期的已解析批次放弃后修订号加一', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch());
  const result = await makeDiscardStaleImports({ uow: memory.unitOfWork, clock: new FixedClock(at) })({}, actor);
  expect(result.discarded).toBe(1);
  const after = await memory.stores.imports.get('stale-batch');
  expect(after.status).toBe('discarded');
  expect(after.revision).toBe(1);
});

it('提交已经写上新修订号后，过期放弃不能把批次盖回已放弃', async () => {
  const memory = createMemory();
  const parsed = batch();
  await memory.stores.imports.save(parsed);
  const clock = new FixedClock(at);
  await makeCommitImport({ uow: memory.unitOfWork, clock })({ importBatchId: parsed.id }, actor);
  const committed = await memory.stores.imports.get(parsed.id);
  expect(committed.status).toBe('committed');
  const discard = makeDiscardStaleImports({
    uow: {
      async run(fn) {
        return memory.unitOfWork.run(async (tx) => fn({
          ...tx,
          imports: { ...tx.imports, list: async () => [parsed] },
        }));
      },
    },
    clock,
  });
  await expect(discard({}, actor)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  const after = await memory.stores.imports.get(parsed.id);
  expect(after.status).toBe('committed');
  expect(after.revision).toBe(committed.revision);
});

it('过期放弃先占住修订号后，拿旧批次提交不能把它改回已提交', async () => {
  const memory = createMemory();
  const parsed = batch();
  await memory.stores.imports.save(parsed);
  const clock = new FixedClock(at);
  await makeDiscardStaleImports({ uow: memory.unitOfWork, clock })({}, actor);
  const discarded = await memory.stores.imports.get(parsed.id);
  expect(discarded.status).toBe('discarded');
  const commit = makeCommitImport({
    uow: {
      async run(fn) {
        return memory.unitOfWork.run(async (tx) => fn({
          ...tx,
          imports: { ...tx.imports, get: async () => parsed },
        }));
      },
    },
    clock,
  });
  await expect(commit({ importBatchId: parsed.id, expectedRevision: 0 }, actor)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  const after = await memory.stores.imports.get(parsed.id);
  expect(after.status).toBe('discarded');
  expect(after.revision).toBe(discarded.revision);
});
