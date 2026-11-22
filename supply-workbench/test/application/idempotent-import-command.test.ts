import { expect, it } from 'vitest';
import { makeIdempotentImportCommand, type ImportMutationClaim } from '../../packages/application/src/imports/use-cases/run-idempotent-command.js';
import { StateConflictError } from '../../packages/application/src/shared/errors.js';

const command = { route: 'commit', resourceId: 'batch-1', actorId: 'actor-1', payload: { expectedRevision: 2 } };

it('空白幂等键直接执行，不声明', async () => {
  let claimCount = 0;
  const run = makeIdempotentImportCommand({
    claim: async () => {
      claimCount += 1;
      return { kind: 'busy' };
    },
    complete: async () => undefined,
    release: async () => undefined,
  });
  const result = await run({ ...command, key: '  ', run: async () => ({ importBatchId: 'batch-1' }) });
  expect(result).toEqual({ importBatchId: 'batch-1' });
  expect(claimCount).toBe(0);
});

it('回放返回原结果，不再执行', async () => {
  let hasRun = false;
  const run = runner(async () => ({ kind: 'replay', result: { importBatchId: 'stored' } }));
  const result = await run.command({ ...command, key: 'k-1', run: async () => {
    hasRun = true;
    return { importBatchId: 'fresh' };
  } });
  expect(result).toEqual({ importBatchId: 'stored' });
  expect(hasRun).toBe(false);
  expect(run.completed).toEqual([]);
});

it('载荷冲突和占用中都拒绝执行', async () => {
  await expect(runner(async () => ({ kind: 'payload_conflict' })).command({ ...command, key: 'k-1', run: async () => ({ importBatchId: 'batch-1' }) })).rejects.toMatchObject({ details: { state: 'idempotency payload' } });
  await expect(runner(async () => ({ kind: 'busy' })).command({ ...command, key: 'k-1', run: async () => ({ importBatchId: 'batch-1' }) })).rejects.toBeInstanceOf(StateConflictError);
});

it('完成声明失败时也释放声明', async () => {
  const released: string[] = [];
  const run = makeIdempotentImportCommand({
    claim: async () => ({ kind: 'claimed', id: 'claim-3' }),
    complete: async () => {
      throw new Error('写回放失败');
    },
    release: async (id) => {
      released.push(id);
    },
  });
  await expect(run({ ...command, key: 'k-1', run: async () => ({ importBatchId: 'batch-1' }) })).rejects.toThrow('写回放失败');
  expect(released).toEqual(['claim-3']);
});

it('执行成功后完成声明，失败后释放声明', async () => {
  const success = runner(async () => ({ kind: 'claimed', id: 'claim-1' }));
  await expect(success.command({ ...command, key: 'k-1', run: async () => ({ importBatchId: 'batch-1' }) })).resolves.toEqual({ importBatchId: 'batch-1' });
  expect(success.completed).toEqual([{ id: 'claim-1', result: { importBatchId: 'batch-1' } }]);
  expect(success.released).toEqual([]);

  const failure = runner(async () => ({ kind: 'claimed', id: 'claim-2' }));
  await expect(failure.command({ ...command, key: 'k-1', run: async () => {
    throw new Error('提交失败');
  } })).rejects.toThrow('提交失败');
  expect(failure.completed).toEqual([]);
  expect(failure.released).toEqual(['claim-2']);
});

function runner(claim: () => Promise<ImportMutationClaim>) {
  const completed: { readonly id: string; readonly result: { readonly importBatchId: string } }[] = [];
  const released: string[] = [];
  return {
    completed,
    released,
    command: makeIdempotentImportCommand({
      claim,
      complete: async (input) => {
        completed.push(input);
      },
      release: async (id) => {
        released.push(id);
      },
    }),
  };
}
