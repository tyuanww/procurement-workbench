import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { waitForAcceptanceProcess } from '../../e2e/acceptance-process.ts';

it('保留浏览器验收非零退出状态', async () => {
  const acceptance = spawn(process.execPath, ['--eval', 'process.exit(7)'], { stdio: 'ignore' });
  expect(await waitForAcceptanceProcess(acceptance, 5_000)).toEqual({ status: 7, signal: null });
});

it('浏览器验收超时后只结束直接启动的进程', async () => {
  const hold = 'setInterval(() => {}, 60_000);';
  const acceptance = spawn(process.execPath, ['--eval', `process.on('SIGTERM', () => {}); console.log('ready'); ${hold}`], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const unrelated = spawn(process.execPath, ['--eval', hold], { stdio: 'ignore' });
  try {
    await once(acceptance.stdout, 'data', { signal: globalThis.AbortSignal.timeout(5_000) });
    const outcome = await waitForAcceptanceProcess(acceptance, 100);
    expect(outcome.error?.message).toContain('ETIMEDOUT');
    expect(outcome.signal).toBe(process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL');
    expect(outcome.cleanupErrors).toEqual([]);
    expect(unrelated.signalCode).toBeNull();
    expect(unrelated.exitCode).toBeNull();
  } finally {
    if (acceptance.exitCode === null && acceptance.signalCode === null) acceptance.kill('SIGKILL');
    unrelated.kill('SIGKILL');
  }
});
