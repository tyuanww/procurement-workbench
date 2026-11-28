import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

type Outcome = {
  readonly status: number | null;
  readonly signal: ChildProcess['signalCode'];
  readonly error?: Error;
  readonly cleanupErrors?: readonly unknown[];
};

const acceptanceTimeout = 360_000;
const treeTimeout = 5_000;
const sampleInterval = 250;
const sampleTimeout = 500;

export function runAcceptanceProcess(env: typeof process.env): Promise<Outcome> {
  const child = spawn(process.execPath, ['--experimental-strip-types', 'e2e/preaccept-ui.ts'], {
    env, stdio: 'inherit', windowsHide: true,
  });
  return waitForAcceptanceProcess(child, acceptanceTimeout);
}

export async function waitForAcceptanceProcess(child: ChildProcess, timeout: number): Promise<Outcome> {
  if (hasExited(child)) return { status: child.exitCode, signal: child.signalCode };
  const cleanupErrors: unknown[] = [];
  const finished = new Promise<Outcome>((resolve) => {
    child.once('exit', (status, signal) => resolve({ status, signal }));
    child.on('error', (error) => {
      if (child.pid === undefined) resolve({ status: null, signal: null, error });
      else cleanupErrors.push(error);
    });
  });
  const timer = new globalThis.AbortController();
  const limit = delay<'timeout'>(timeout, 'timeout', { signal: timer.signal, ref: false });
  const tree = process.platform === 'win32' ? undefined : trackUnixTree(child);
  try {
    const outcome = await Promise.race([finished, limit]);
    tree?.stop();
    if (outcome !== 'timeout') {
      if (outcome.status === 0) return outcome;
      if (tree !== undefined) terminateUnixTree(child, tree, cleanupErrors);
      return { ...outcome, ...(cleanupErrors.length ? { cleanupErrors } : {}) };
    }
    if (tree === undefined) terminateWindowsTree(child, cleanupErrors);
    else terminateUnixTree(child, tree, cleanupErrors);
    const stopped = await Promise.race([finished, delay<'timeout'>(treeTimeout, 'timeout', { signal: timer.signal, ref: false })]);
    if (stopped === 'timeout') cleanupErrors.push(new Error('Timed out waiting for the browser acceptance process to exit'));
    const result = stopped === 'timeout' ? { status: null, signal: null } : stopped;
    return { ...result, error: new Error(`Browser acceptance subprocess ETIMEDOUT after ${timeout}ms`), cleanupErrors };
  } finally {
    tree?.stop();
    timer.abort();
  }
}

function terminateWindowsTree(child: ChildProcess, errors: unknown[]): void {
  if (child.pid === undefined || hasExited(child)) return;
  try {
    const killed = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      timeout: treeTimeout, killSignal: 'SIGKILL', windowsHide: true, encoding: 'utf8',
    });
    if (killed.error) throw killed.error;
    if (killed.status !== 0) throw new Error(`taskkill could not stop the browser acceptance tree: ${(killed.stderr || killed.stdout).trim()}`);
  } catch (error) {
    errors.push(error);
    killRoot(child, errors);
  }
}

function killRoot(child: ChildProcess, errors: unknown[]): void {
  if (child.pid === undefined || hasExited(child)) return;
  try {
    if (!child.kill('SIGKILL')) errors.push(new Error('Unable to signal the browser acceptance root process'));
  } catch (error) {
    errors.push(error);
  }
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

type ProcessIdentity = { readonly pid: number; readonly parent: number; readonly signature: string };

function trackUnixTree(child: ChildProcess) {
  let known: readonly ProcessIdentity[] = [];
  let root: ProcessIdentity | undefined;
  let sampleError: unknown;
  const sample = (timeout = sampleTimeout) => {
    try {
      const snapshot = processes(timeout);
      if (root === undefined && !hasExited(child)) root = snapshot.find((row) => row.pid === child.pid && row.parent === process.pid);
      known = trackedProcesses(root, known, snapshot);
    } catch (error) {
      sampleError ??= error;
    }
  };
  sample();
  const interval = globalThis.setInterval(() => sample(), sampleInterval);
  interval.unref();
  return { sample, stop: () => globalThis.clearInterval(interval), descendants: () => known, sampleError: () => sampleError };
}

function terminateUnixTree(child: ChildProcess, tree: ReturnType<typeof trackUnixTree>, errors: unknown[]): void {
  tree.sample();
  killRoot(child, errors);
  tree.sample();
  const sampleError = tree.sampleError();
  if (sampleError !== undefined) errors.push(sampleError);
  const deadline = performance.now() + treeTimeout;
  for (const entry of tree.descendants()) {
    try {
      signalTrackedProcess(entry, deadline);
    } catch (error) {
      errors.push(error);
    }
  }
}

function signalTrackedProcess(entry: ProcessIdentity, deadline: number): void {
  const remaining = Math.floor(deadline - performance.now());
  if (remaining <= 0) throw new Error(`Timed out verifying acceptance process ${entry.pid}`);
  const current = processes(remaining, entry.pid).find((row) => row.pid === entry.pid);
  if (current?.signature !== entry.signature) return;
  try {
    process.kill(entry.pid, 'SIGKILL');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
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

function trackedProcesses(root: ProcessIdentity | undefined, known: readonly ProcessIdentity[], snapshot: readonly ProcessIdentity[]): ProcessIdentity[] {
  const live = new Map(snapshot.map((entry) => [entry.pid, entry]));
  const children = new Map<number, ProcessIdentity[]>();
  for (const entry of snapshot) {
    const siblings = children.get(entry.parent) ?? [];
    siblings.push(entry);
    children.set(entry.parent, siblings);
  }
  const verified = new Map<number, ProcessIdentity>();
  for (const prior of root === undefined ? known : [root, ...known]) {
    const current = live.get(prior.pid);
    if (current?.signature === prior.signature) verified.set(current.pid, current);
  }
  for (const node of verified.values()) {
    for (const member of children.get(node.pid) ?? []) verified.set(member.pid, member);
  }
  if (root !== undefined) verified.delete(root.pid);
  return [...verified.values()];
}
