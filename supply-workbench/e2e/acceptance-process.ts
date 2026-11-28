import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

type Outcome = {
  readonly status: number | null;
  readonly signal: ChildProcess['signalCode'];
  readonly error?: Error;
  readonly cleanupErrors?: readonly unknown[];
};

const acceptanceTimeout = 360_000;
const treeTimeout = 5_000;

export function runAcceptanceProcess(env: typeof process.env): Promise<Outcome> {
  const child = spawn(process.execPath, ['--experimental-strip-types', 'e2e/preaccept-ui.ts'], {
    env, stdio: 'inherit', windowsHide: true,
  });
  return waitForAcceptanceProcess(child, acceptanceTimeout);
}

export async function waitForAcceptanceProcess(child: ChildProcess, timeout: number): Promise<Outcome> {
  if (hasExited(child)) return { status: child.exitCode, signal: child.signalCode };
  const finished = new Promise<Outcome>((resolve) => {
    child.once('exit', (status, signal) => resolve({ status, signal }));
    child.once('error', (error) => resolve({ status: null, signal: null, error }));
  });
  const timer = new globalThis.AbortController();
  try {
    const outcome = await Promise.race([finished, delay<'timeout'>(timeout, 'timeout', { signal: timer.signal, ref: false })]);
    if (outcome !== 'timeout') return outcome;
    const cleanupErrors = terminateTree(child);
    const stopped = await Promise.race([finished, delay<'timeout'>(treeTimeout, 'timeout', { signal: timer.signal, ref: false })]);
    if (stopped === 'timeout') cleanupErrors.push(new Error('Timed out waiting for the browser acceptance process to exit'));
    const result = stopped === 'timeout' ? { status: null, signal: null } : stopped;
    return { ...result, error: new Error(`Browser acceptance subprocess ETIMEDOUT after ${timeout}ms`), cleanupErrors };
  } finally {
    timer.abort();
  }
}

function terminateTree(child: ChildProcess): unknown[] {
  const errors: unknown[] = [];
  if (child.pid === undefined || hasExited(child)) return errors;
  try {
    if (process.platform === 'win32') {
      const killed = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        timeout: treeTimeout, killSignal: 'SIGKILL', windowsHide: true, encoding: 'utf8',
      });
      if (killed.error) throw killed.error;
      if (killed.status !== 0) throw new Error(`taskkill could not stop the browser acceptance tree: ${(killed.stderr || killed.stdout).trim()}`);
    } else {
      terminateUnixTree(child, child.pid);
    }
  } catch (error) {
    errors.push(error);
    try {
      if (!hasExited(child)) child.kill('SIGKILL');
    } catch (killError) {
      errors.push(killError);
    }
  }
  return errors;
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

type ProcessIdentity = { readonly pid: number; readonly parent: number; readonly signature: string };

function terminateUnixTree(child: ChildProcess, pid: number): void {
  const root = processes(treeTimeout, pid).find((row) => row.pid === pid && row.parent === process.pid);
  if (root === undefined) throw new Error('Unable to verify the browser acceptance root process');
  if (!child.kill('SIGSTOP')) return;
  const frozen = new Map<number, ProcessIdentity>();
  try {
    const deadline = Date.now() + treeTimeout;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Timed out identifying the browser acceptance descendants');
      const descendants = descendantsOf(root, processes(remaining));
      const pending = descendants.filter((row) => frozen.get(row.pid)?.signature !== row.signature);
      if (pending.length === 0) break;
      for (const row of pending) {
        if (signalProcess(row, 'SIGSTOP', deadline)) frozen.set(row.pid, row);
      }
    }
  } finally {
    terminateFrozen(root, [...frozen.values()].reverse());
  }
}

function terminateFrozen(root: ProcessIdentity, frozen: readonly ProcessIdentity[]): void {
  const deadline = Date.now() + treeTimeout;
  const errors: unknown[] = [];
  for (const entry of [...frozen, root]) {
    try {
      signalProcess(entry, 'SIGKILL', deadline);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Unable to terminate every isolated browser acceptance process');
}

function signalProcess(entry: ProcessIdentity, signal: 'SIGSTOP' | 'SIGKILL', deadline: number): boolean {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error(`Timed out verifying acceptance process ${entry.pid}`);
  const current = processes(remaining, entry.pid).find((row) => row.pid === entry.pid);
  if (current?.parent !== entry.parent || current.signature !== entry.signature) return false;
  try {
    process.kill(entry.pid, signal);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

function processes(timeout: number, pid?: number): ProcessIdentity[] {
  const scope = pid === undefined ? ['-A'] : ['-p', String(pid)];
  const result = spawnSync('ps', [...scope, '-o', 'pid=,ppid=,lstart=,comm='], {
    timeout, killSignal: 'SIGKILL', encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' },
  });
  if (result.error) throw result.error;
  if (pid !== undefined && result.status === 1 && !result.stdout.trim()) return [];
  if (result.status !== 0) throw new Error(`Unable to list acceptance processes: ${result.stderr.trim()}`);
  return result.stdout.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
    if (match === null) return [];
    return [{ pid: Number(match[1]), parent: Number(match[2]), signature: match[3] ?? '' }];
  });
}

function descendantsOf(root: ProcessIdentity, snapshot: readonly ProcessIdentity[]): ProcessIdentity[] {
  if (!snapshot.some((row) => row.pid === root.pid && row.parent === root.parent && row.signature === root.signature)) return [];
  const children = new Map<number, ProcessIdentity[]>();
  for (const entry of snapshot) {
    const siblings = children.get(entry.parent) ?? [];
    siblings.push(entry);
    children.set(entry.parent, siblings);
  }
  const tree = [root];
  for (const node of tree) tree.push(...(children.get(node.pid) ?? []));
  return tree.slice(1);
}
