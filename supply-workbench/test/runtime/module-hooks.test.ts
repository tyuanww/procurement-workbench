import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const dockerLoader = path.join(root, 'docker/loader.mts');
const dockerRegister = path.join(root, 'docker/register.mts');
const reconcileLoader = path.join(root, 'tools/reconcile/loader.mts');
const reconcileRegister = path.join(root, 'tools/reconcile/register.mts');

type HookContext = { readonly parentURL?: string };
type HookResult = { readonly url: string; readonly shortCircuit?: boolean };
type NextResolve = (specifier: string, context: HookContext) => Promise<HookResult>;
type UnknownFn = (...args: readonly unknown[]) => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnknownFn(value: unknown): value is UnknownFn {
  return typeof value === 'function';
}

function isHookResult(value: unknown): value is HookResult {
  if (!isRecord(value) || typeof value.url !== 'string') return false;
  if (!('shortCircuit' in value)) return true;
  return typeof value.shortCircuit === 'boolean';
}

function readResult(value: unknown): HookResult {
  if (!isHookResult(value)) throw new Error('钩子返回值不对');
  if (value.shortCircuit === undefined) return { url: value.url };
  return { url: value.url, shortCircuit: value.shortCircuit };
}

async function callHook(input: {
  readonly file: string;
  readonly specifier: string;
  readonly context: HookContext;
  readonly next: NextResolve;
}): Promise<HookResult> {
  const loaded: unknown = await import(pathToFileURL(input.file).href);
  if (!isRecord(loaded) || !isUnknownFn(loaded.resolve) || loaded.resolve.length !== 3) {
    throw new Error(`没有 resolve 钩子 ${input.file}`);
  }
  const called: unknown = await loaded.resolve(input.specifier, input.context, input.next);
  return readResult(called);
}

function trackingNext(url: string): {
  readonly next: NextResolve;
  readonly wasCalled: () => boolean;
} {
  let isCalled = false;
  return {
    next: () => {
      isCalled = true;
      return Promise.resolve({ url });
    },
    wasCalled: () => isCalled,
  };
}

function failingNext(message: string): NextResolve {
  return () => Promise.reject(new Error(message));
}

function parentUrl(dir: string, name: string): string {
  return pathToFileURL(path.join(dir, name)).href;
}

async function withFiles(
  files: Readonly<Record<string, string>>,
  body: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sw-hook-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      const full = path.join(dir, name);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, text);
    }
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runNode(args: readonly string[]): string {
  const result = spawnSync(process.execPath, [...args], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

it('生产钩子挂上后，src 里缺失的 js 会落到 dist', async () => {
  await withFiles(
    {
      'src/caller.mjs': "import { value } from './dep.js';\nconsole.log(value);\n",
      'dist/dep.js': "export const value = 'from-dist';\n",
    },
    async (dir) => {
      const stdout = runNode([
        '--experimental-strip-types',
        '--import',
        dockerRegister,
        path.join(dir, 'src/caller.mjs'),
      ]);
      expect(stdout.trim()).toBe('from-dist');
    },
  );
});

it('对账钩子挂上后，相对 js 会落到同目录 ts', async () => {
  await withFiles(
    {
      'main.ts': "export const value = 'from-ts';\n",
      'cli.ts': "import { value } from './main.js';\nconsole.log(value);\n",
    },
    async (dir) => {
      const stdout = runNode([
        '--experimental-strip-types',
        '--import',
        reconcileRegister,
        path.join(dir, 'cli.ts'),
      ]);
      expect(stdout.trim()).toBe('from-ts');
    },
  );
});

it('生产钩子在默认解析成功时不改写', async () => {
  await withFiles({ 'dist/dep.js': '' }, async (dir) => {
    const tracked = trackingNext('file:///from-next');
    const result = await callHook({
      file: dockerLoader,
      specifier: './dep.js',
      context: { parentURL: parentUrl(dir, 'src/caller.ts') },
      next: tracked.next,
    });
    expect(result).toEqual({ url: 'file:///from-next' });
    expect(tracked.wasCalled()).toBe(true);
  });
});

it('生产钩子在 src 的 js 缺失且 dist 存在时改用 dist', async () => {
  await withFiles({ 'dist/dep.js': '' }, async (dir) => {
    const result = await callHook({
      file: dockerLoader,
      specifier: './dep.js',
      context: { parentURL: parentUrl(dir, 'src/caller.ts') },
      next: failingNext('from-next'),
    });
    expect(result).toEqual({ url: parentUrl(dir, 'dist/dep.js'), shortCircuit: true });
  });
});

it('生产钩子不改写 src 以外的路径', async () => {
  await withFiles({ 'dist/dep.js': '' }, async (dir) => {
    await expect(
      callHook({
        file: dockerLoader,
        specifier: './dep.js',
        context: { parentURL: parentUrl(dir, 'lib/caller.ts') },
        next: failingNext('from-next'),
      }),
    ).rejects.toThrow('from-next');
  });
});

it('生产钩子没有 parentURL 时保持后续解析的错误', async () => {
  await expect(
    callHook({
      file: dockerLoader,
      specifier: './dep.js',
      context: {},
      next: failingNext('from-next'),
    }),
  ).rejects.toThrow('from-next');
});

it('生产钩子不改写非 js 说明符', async () => {
  await expect(
    callHook({
      file: dockerLoader,
      specifier: './dep.ts',
      context: { parentURL: 'file:///app/src/caller.ts' },
      next: failingNext('from-next'),
    }),
  ).rejects.toThrow('from-next');
});

it('生产钩子在 dist 也不存在时抛出访问错误', async () => {
  await expect(
    callHook({
      file: dockerLoader,
      specifier: './missing.js',
      context: { parentURL: parentUrl(tmpdir(), 'src/caller.ts') },
      next: failingNext('from-next'),
    }),
  ).rejects.toThrow('ENOENT');
});

it('对账钩子在同目录有 ts 时不调用后续解析', async () => {
  await withFiles({ 'mod.ts': '' }, async (dir) => {
    const tracked = trackingNext('file:///from-next');
    const result = await callHook({
      file: reconcileLoader,
      specifier: './mod.js',
      context: { parentURL: parentUrl(dir, 'caller.ts') },
      next: tracked.next,
    });
    expect(result).toEqual({ url: parentUrl(dir, 'mod.ts'), shortCircuit: true });
    expect(tracked.wasCalled()).toBe(false);
  });
});

it('对账钩子在没有 ts 时交给后续解析', async () => {
  const tracked = trackingNext('file:///from-next');
  const result = await callHook({
    file: reconcileLoader,
    specifier: './mod.js',
    context: { parentURL: parentUrl(tmpdir(), 'missing/caller.ts') },
    next: tracked.next,
  });
  expect(result).toEqual({ url: 'file:///from-next' });
  expect(tracked.wasCalled()).toBe(true);
});

it('对账钩子不改写非相对说明符', async () => {
  const result = await callHook({
    file: reconcileLoader,
    specifier: 'pkg/mod.js',
    context: { parentURL: 'file:///app/caller.ts' },
    next: trackingNext('file:///from-next').next,
  });
  expect(result).toEqual({ url: 'file:///from-next' });
});

it('对账钩子没有 parentURL 时交给后续解析', async () => {
  const result = await callHook({
    file: reconcileLoader,
    specifier: './mod.js',
    context: {},
    next: trackingNext('file:///from-next').next,
  });
  expect(result).toEqual({ url: 'file:///from-next' });
});

it('对账钩子不改写非 js 说明符', async () => {
  const result = await callHook({
    file: reconcileLoader,
    specifier: './mod.ts',
    context: { parentURL: 'file:///app/caller.ts' },
    next: trackingNext('file:///from-next').next,
  });
  expect(result).toEqual({ url: 'file:///from-next' });
});
