import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { waitForAcceptanceProcess } from '../../e2e/acceptance-process.ts';

const hold = 'setInterval(() => {}, 60_000);';
const detachedChild = `
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, ['--eval', ${JSON.stringify(hold)}], { detached: true, stdio: 'ignore' });
  child.on('spawn', () => console.log(child.pid));
  ${hold}
`;

it.skipIf(process.platform === 'win32')('验收超时会结束独立进程组的后代，同时保留无关进程', async () => {
  const acceptance = spawn(process.execPath, ['--eval', detachedChild], { stdio: ['ignore', 'pipe', 'ignore'] });
  const unrelated = spawn(process.execPath, ['--eval', hold], { stdio: 'ignore' });
  let browserPid: number | undefined;
  try {
    const [ready] = await once(acceptance.stdout, 'data', { signal: globalThis.AbortSignal.timeout(5_000) });
    browserPid = Number(String(ready).trim());
    expect(browserPid).toBeGreaterThan(0);
    const outcome = await waitForAcceptanceProcess(acceptance, 100);
    expect(outcome.signal).toBe('SIGKILL');
    expect(outcome.error?.message).toContain('ETIMEDOUT');
    expect(outcome.cleanupErrors).toEqual([]);
    expect(isStopped(browserPid)).toBe(true);
    expect(isStopped(unrelated.pid)).toBe(false);
  } finally {
    if (acceptance.exitCode === null && acceptance.signalCode === null) acceptance.kill('SIGKILL');
    if (browserPid !== undefined && browserPid > 0 && !isStopped(browserPid)) process.kill(browserPid, 'SIGKILL');
    unrelated.kill('SIGKILL');
  }
});

function isStopped(pid: number | undefined): boolean {
  if (pid === undefined) throw new Error('Missing test process PID');
  const state = spawnSync('ps', ['-p', String(pid), '-o', 'state='], { encoding: 'utf8', timeout: 1_000, killSignal: 'SIGKILL' });
  if (state.error) throw state.error;
  return state.stdout.trim() === '' || state.stdout.trim().startsWith('Z');
}
