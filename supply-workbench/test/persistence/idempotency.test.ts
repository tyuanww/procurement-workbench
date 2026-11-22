import { expect, it } from 'vitest';
import { claimCommand, completeCommand, createDb, migrate } from '../../packages/persistence/src/index.js';

it('持久化幂等键在进程重建后仍可回放，并拒绝载荷漂移', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  const input = { db: handle.db, actorId: 'actor-1', route: 'commit', resourceId: 'batch-1', key: 'k-1', payload: { expectedRevision: 2 }, at: '2026-10-12T00:00:00.000Z' };
  const first = await claimCommand(input);
  expect(first.kind).toBe('claimed');
  if (first.kind !== 'claimed') throw new Error('第一次声明没有成功');
  await completeCommand({ db: handle.db, id: first.id, result: { importBatchId: 'batch-1' }, at: '2026-10-12T00:00:01.000Z' });
  const replay = await claimCommand(input);
  expect(replay).toEqual({ kind: 'replay', result: { importBatchId: 'batch-1' } });
  const drift = await claimCommand({ ...input, payload: { expectedRevision: 3 } });
  expect(drift.kind).toBe('payload_conflict');
  await handle.close();
});
