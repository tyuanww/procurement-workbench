import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

it('new:template 存在，且干跑不改仓库', () => {
  const result = run('scripts/new-template.ts', 'probe-gen-dry-v1');
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('packages/domain/src/vocabulary/imports.ts');
  expect(result.stdout).toContain('packages/importers/src/registry.ts');
  expect(result.stdout).toContain('packages/importers/src/templates/probe-gen-dry-v1/index.ts');
  expect(existsSync(path.join(root, 'packages/importers/src/templates/probe-gen-dry-v1'))).toBe(false);
});

it('new:capability 存在，且干跑不改仓库', () => {
  const result = run('scripts/new-capability.ts', 'probe-gen-cap-dry');
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('packages/contracts/src/capabilities.ts');
  expect(result.stdout).toContain('packages/application/src/probe-gen-cap-dry/index.ts');
  expect(existsSync(path.join(root, 'packages/application/src/probe-gen-cap-dry'))).toBe(false);
});

it('new:capability 可以生成并删除回滚', () => {
  const dir = sandbox(['scripts/new-capability.ts', 'packages/contracts/src/capabilities.ts']);
  const manifest = path.join(dir, 'packages/contracts/src/capabilities.ts');
  const before = readFileSync(manifest, 'utf8');
  try {
    expect(runIn(dir, 'new-capability.ts', 'probe-apply-cap').status).toBe(0);
    expect(existsSync(path.join(dir, 'packages/application/src/probe-apply-cap/index.ts'))).toBe(true);
    expect(readFileSync(manifest, 'utf8')).toContain("'probe-apply-cap'");
    expect(runIn(dir, 'new-capability.ts', 'probe-apply-cap', '--remove').status).toBe(0);
    expect(existsSync(path.join(dir, 'packages/application/src/probe-apply-cap'))).toBe(false);
    expect(readFileSync(manifest, 'utf8')).toBe(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('new:feature 可以生成并删除回滚', () => {
  const dir = sandbox(['scripts/new-feature.ts', 'apps/web/src/app/page-manifest.tsx']);
  const manifest = path.join(dir, 'apps/web/src/app/page-manifest.tsx');
  const before = readFileSync(manifest, 'utf8');
  try {
    expect(runIn(dir, 'new-feature.ts', 'probe-apply-page').status).toBe(0);
    expect(existsSync(path.join(dir, 'apps/web/src/pages/probe-apply-page/ProbeApplyPage.tsx'))).toBe(true);
    expect(readFileSync(manifest, 'utf8')).toContain("path: '/probe-apply-page'");
    expect(runIn(dir, 'new-feature.ts', 'probe-apply-page', '--remove').status).toBe(0);
    expect(existsSync(path.join(dir, 'apps/web/src/pages/probe-apply-page'))).toBe(false);
    expect(readFileSync(manifest, 'utf8')).toBe(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('new:template 可以生成并删除回滚', () => {
  const dir = sandbox(['scripts/new-template.ts', 'packages/domain/src/vocabulary/imports.ts', 'packages/importers/src/registry.ts']);
  const imports = path.join(dir, 'packages/domain/src/vocabulary/imports.ts');
  const registry = path.join(dir, 'packages/importers/src/registry.ts');
  const beforeImports = readFileSync(imports, 'utf8');
  const beforeRegistry = readFileSync(registry, 'utf8');
  try {
    expect(runIn(dir, 'new-template.ts', 'probe-apply-v1').status).toBe(0);
    expect(existsSync(path.join(dir, 'packages/importers/src/templates/probe-apply-v1/index.ts'))).toBe(true);
    expect(readFileSync(imports, 'utf8')).toContain("'probe-apply-v1'");
    expect(readFileSync(registry, 'utf8')).toContain('probeApplyV1');
    expect(runIn(dir, 'new-template.ts', 'probe-apply-v1', '--remove').status).toBe(0);
    expect(existsSync(path.join(dir, 'packages/importers/src/templates/probe-apply-v1'))).toBe(false);
    expect(readFileSync(imports, 'utf8')).toBe(beforeImports);
    expect(readFileSync(registry, 'utf8')).toBe(beforeRegistry);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe.each([
  {
    script: 'new-capability.ts',
    id: 'probe-mode-cap',
    manifests: ['packages/contracts/src/capabilities.ts'],
    generated: 'packages/application/src/probe-mode-cap/index.ts',
  },
  {
    script: 'new-feature.ts',
    id: 'probe-mode-page',
    manifests: ['apps/web/src/app/page-manifest.tsx'],
    generated: 'apps/web/src/pages/probe-mode-page/ProbeModePage.tsx',
  },
  {
    script: 'new-template.ts',
    id: 'probe-mode-v1',
    manifests: ['packages/domain/src/vocabulary/imports.ts', 'packages/importers/src/registry.ts'],
    generated: 'packages/importers/src/templates/probe-mode-v1/index.ts',
  },
])('$script 拒绝冲突的操作模式', ({ script, id, manifests, generated }) => {
  it.each([
    { flags: ['--dry-run', '--remove'] },
    { flags: ['--remove', '--dry-run'] },
  ])('$flags 保留生成文件和清单', ({ flags }) => {
    const dir = sandbox([`scripts/${script}`, ...manifests]);
    try {
      const applied = runIn(dir, script, id);
      expect(applied.status, applied.stderr).toBe(0);
      const files = [generated, ...manifests];
      const before = files.map((file) => readFileSync(path.join(dir, file)));

      const result = runIn(dir, script, id, ...flags);

      expect(result.status).not.toBeNull();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('--dry-run');
      expect(result.stderr).toContain('--remove');
      expect(files.map((file) => readFileSync(path.join(dir, file)))).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

it('已存在的 id 不能重复生成', () => {
  expect(run('scripts/new-template.ts', 'po-master-v1').status).not.toBe(0);
  expect(run('scripts/new-capability.ts', 'platform').status).not.toBe(0);
});

it('非法 id 被拒绝', () => {
  const template = run('scripts/new-template.ts', 'probe');
  expect(template.stdout + template.stderr).toContain('id');
  const capability = run('scripts/new-capability.ts', 'Probe_Cap');
  expect(capability.stdout + capability.stderr).toContain('id');
});


it('new:feature 存在，且干跑不改仓库', () => {
  const result = run('scripts/new-feature.ts', 'probe-gen-page-dry');
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('apps/web/src/pages/probe-gen-page-dry/');
  expect(result.stdout).toContain('apps/web/src/app/page-manifest.tsx');
  expect(existsSync(path.join(root, 'apps/web/src/pages/probe-gen-page-dry'))).toBe(false);
});

it('已存在的页面 id 不能重复生成', () => {
  expect(run('scripts/new-feature.ts', 'today').status).not.toBe(0);
});

function sandbox(files: readonly string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sw-generator-'));
  for (const file of files) {
    const target = path.join(dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(root, file), target);
  }
  return dir;
}

function runIn(dir: string, script: string, ...args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', path.join('scripts', script), ...args], { cwd: dir, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function run(script: string, id: string): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', script, id, '--dry-run'], { cwd: root, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
