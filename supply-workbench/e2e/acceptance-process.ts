import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

type Outcome = {
  readonly status: number | null;
  readonly signal: ChildProcess['signalCode'];
  readonly error?: Error;
  readonly cleanupErrors?: readonly unknown[];
};

export function runAcceptanceProcess(env: typeof process.env): Promise<Outcome> {
  const child = spawn(process.execPath, ['--experimental-strip-types', 'e2e/preaccept-ui.ts'], {
    env, stdio: 'inherit', windowsHide: true,
  });
  return waitForAcceptanceProcess(child, 420_000);
}

export async function waitForAcceptanceProcess(child: ChildProcess, timeout: number): Promise<Outcome> {
  if (child.exitCode !== null || child.signalCode !== null) return { status: child.exitCode, signal: child.signalCode };
  const cleanupErrors: unknown[] = [];
  const finished = new Promise<Outcome>((resolve) => {
    child.once('exit', (status, signal) => resolve({ status, signal }));
    child.on('error', (error) => {
      if (child.pid === undefined) resolve({ status: null, signal: null, error });
      else cleanupErrors.push(error);
    });
  });
  const timer = new globalThis.AbortController();
  const wait = (ms: number) => Promise.race([finished, delay<'timeout'>(ms, 'timeout', { signal: timer.signal, ref: false })]);
  try {
    const outcome = await wait(timeout);
    if (outcome !== 'timeout') return outcome;

    const error = new Error(`Browser acceptance subprocess ETIMEDOUT after ${timeout}ms`);
    for (const [signal, grace] of [['SIGTERM', 1_000], ['SIGKILL', 5_000]] as const) {
      // Keep the normal Playwright close path available before forcing this owned child to exit.
      try {
        child.kill(signal);
      } catch (killError) {
        cleanupErrors.push(killError);
      }
      const stopped = await wait(grace);
      if (stopped !== 'timeout') return { ...stopped, error, cleanupErrors };
    }
    child.unref();
    cleanupErrors.push(new Error('Timed out waiting for the browser acceptance process to exit'));
    return { status: null, signal: null, error, cleanupErrors };
  } finally {
    timer.abort();
  }
}
