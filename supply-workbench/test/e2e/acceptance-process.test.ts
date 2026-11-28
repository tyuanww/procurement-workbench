import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { waitForAcceptanceProcess } from '../../e2e/acceptance-process.ts';

const hold = 'setInterval(() => {}, 60_000);';
const launchDetached = `
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, ['--eval', ${JSON.stringify(hold)}], { detached: true, stdio: 'ignore' });
  child.on('spawn', () => console.log(child.pid + ':' + process.pid));
`;
const relay = `
  const { spawn } = require('node:child_process');
  spawn(process.execPath, ['--eval', ${JSON.stringify(launchDetached + hold)}], { stdio: ['ignore', 'inherit', 'ignore'] });
  ${hold}
`;
type Method = 'timeout' | 'abnormal' | 'reparented';

it.skipIf(process.platform === 'win32').each([
  { method: 'timeout', program: launchDetached + hold },
  { method: 'abnormal', program: launchDetached + "process.on('SIGTERM', () => process.exit(7));" + hold },
  { method: 'reparented', program: relay },
] as const)('验收 $method 会结束已验证的后代，同时保留无关进程', async ({ method, program }) => {
  const acceptance = spawn(process.execPath, ['--eval', program], { stdio: ['ignore', 'pipe', 'ignore'] });
  const unrelated = spawn(process.execPath, ['--eval', hold], { stdio: 'ignore' });
  let browserPid: number | undefined;
  try {
    const { pid, owner } = await fixturePids(acceptance);
    browserPid = pid;
    const outcome = await runFixture({ acceptance, method, pid, owner });
    if (method === 'abnormal') expect(outcome.status).toBe(7);
    else {
      expect(outcome.signal).toBe('SIGKILL');
      expect(outcome.error?.message).toContain('ETIMEDOUT');
    }
    expect(outcome.cleanupErrors ?? []).toEqual([]);
    expect(isStopped(browserPid)).toBe(true);
    expect(isStopped(unrelated.pid)).toBe(false);
  } finally {
    if (acceptance.exitCode === null && acceptance.signalCode === null) acceptance.kill('SIGKILL');
    if (browserPid !== undefined && browserPid > 0 && !isStopped(browserPid)) process.kill(browserPid, 'SIGKILL');
    unrelated.kill('SIGKILL');
  }
});

async function fixturePids(acceptance: ChildProcess) {
  if (acceptance.stdout === null) throw new Error('Missing fixture output');
  const [ready] = await once(acceptance.stdout, 'data', { signal: globalThis.AbortSignal.timeout(5_000) });
  const [pid, owner] = String(ready).trim().split(':').map(Number);
  if (pid === undefined || owner === undefined || !(pid > 0 && owner > 0)) throw new Error('Missing test process PID');
  return { pid, owner };
}

async function runFixture({ acceptance, method, pid, owner }: {
  readonly acceptance: ChildProcess; readonly method: Method; readonly pid: number; readonly owner: number;
}) {
  const finished = waitForAcceptanceProcess(acceptance, method === 'timeout' ? 100 : 1_500);
  if (method === 'abnormal') acceptance.kill('SIGTERM');
  if (method === 'reparented') {
    process.kill(owner, 'SIGTERM');
    await expect.poll(() => processField(pid, 'ppid'), { timeout: 1_000 }).not.toBe(String(owner));
    expect(isStopped(pid)).toBe(false);
  }
  return finished;
}

function isStopped(pid: number | undefined): boolean {
  const state = processField(pid, 'state');
  return state === '' || state.startsWith('Z');
}

function processField(pid: number | undefined, field: 'state' | 'ppid'): string {
  if (pid === undefined) throw new Error('Missing test process PID');
  const result = spawnSync('ps', ['-p', String(pid), '-o', field + '='], { encoding: 'utf8', timeout: 1_000, killSignal: 'SIGKILL' });
  if (result.error) throw result.error;
  return result.stdout.trim();
}
