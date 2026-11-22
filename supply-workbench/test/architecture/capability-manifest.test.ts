import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_IDS, CAPABILITY_MANIFEST, WEB_FEATURE_IDS } from '../../packages/contracts/src/index.js';
import { NAV_ROUTES } from '../../apps/web/src/app/page-manifest.js';
import { validateCapabilities } from './capability-validation.js';

const root = path.resolve(import.meta.dirname, '../..');
const applicationDir = 'packages/application/src';
const featuresDir = 'apps/web/src/features';

describe('能力清单', () => {
  it('覆盖应用能力目录，且和 application/src 的目录一致', () => {
    const directories = applicationDirectories();
    expect(CAPABILITY_MANIFEST).toHaveLength(directories.length);
    expect([...CAPABILITY_IDS].sort()).toEqual(directories);
    expect(new Set(CAPABILITY_IDS).size).toBe(directories.length);
    expect(CAPABILITY_MANIFEST.map((entry) => entry.id)).toEqual(CAPABILITY_IDS);
  });

  it('声明的前端 feature 和 apps/web/src/features 的目录一致', () => {
    expect([...WEB_FEATURE_IDS].sort()).toEqual(listDirectories(featuresDir).sort());
    for (const entry of CAPABILITY_MANIFEST) {
      if (entry.webFeature === null) continue;
      expect(WEB_FEATURE_IDS, entry.id).toContain(entry.webFeature);
    }
  });

  it('每个能力都有读权限和合法依赖，路由前缀和写权限可以为空', () => {
    for (const entry of CAPABILITY_MANIFEST) {
      expect(entry.readPermissions.length, entry.id).toBeGreaterThan(0);
      if (entry.routePrefixes.length === 0) expect(entry.webFeature, entry.id).toBeNull();
      expect(entry.dependsOn.includes(entry.id), entry.id).toBe(false);
      expect(new Set(entry.routePrefixes).size, entry.id).toBe(entry.routePrefixes.length);
      expect(new Set(entry.dependsOn).size, entry.id).toBe(entry.dependsOn.length);
      for (const prefix of entry.routePrefixes) expect(prefix.startsWith('/api/v1/'), entry.id).toBe(true);
      for (const dependency of entry.dependsOn) expect(CAPABILITY_IDS, entry.id).toContain(dependency);
    }
  });

  it('导航标签来自壳层导航，且一个标签只归属一个能力', () => {
    const navLabels = NAV_ROUTES.map((route) => route.label);
    expect(navLabels.length).toBeGreaterThan(0);
    const declared = CAPABILITY_MANIFEST.flatMap((entry) => (entry.navLabel === null ? [] : [entry.navLabel]));
    expect(new Set(declared).size).toBe(declared.length);
    for (const label of declared) expect(navLabels, label).toContain(label);
    for (const entry of CAPABILITY_MANIFEST) {
      if (entry.navLabel !== null) expect(entry.webFeature, entry.id).not.toBeNull();
    }
  });

  it('manifest 本身不依赖框架运行时', () => {
    const source = readFileSync(path.join(root, 'packages/contracts/src/capabilities.ts'), 'utf8');
    const specifiers = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1] ?? '');
    expect(specifiers).toEqual(['@sw/domain']);
  });

  it('真实 12 能力在真实目录和前端 feature 下 0 violation', () => {
    expect(validateCapabilities({
      manifest: CAPABILITY_MANIFEST,
      directories: applicationDirectories(),
      webFeatures: listDirectories(featuresDir),
    })).toEqual([]);
  });
});

describe('validateCapabilities 会拦住清单漂移', () => {
  it('假能力 x-fixture 缺目录和 Web feature 时先红后绿', () => {
    const violations = validateCapabilities({
      manifest: [...CAPABILITY_MANIFEST, { id: 'x-fixture', readPermissions: ['data.read'], webFeature: 'x-fixture' }],
      directories: applicationDirectories(),
      webFeatures: listDirectories(featuresDir),
    });
    expect(violations).toEqual([
      { kind: 'missing-directory', id: 'x-fixture' },
      { kind: 'missing-web-feature', id: 'x-fixture', webFeature: 'x-fixture' },
    ]);
  });

  it('多出来的目录会被拦住', () => {
    const violations = validateCapabilities({
      manifest: CAPABILITY_MANIFEST,
      directories: [...applicationDirectories(), 'x-orphan'],
      webFeatures: listDirectories(featuresDir),
    });
    expect(violations).toEqual([{ kind: 'extra-directory', id: 'x-orphan' }]);
  });

  it('缺 Web feature 会被拦住', () => {
    const violations = validateCapabilities({
      manifest: CAPABILITY_MANIFEST,
      directories: applicationDirectories(),
      webFeatures: listDirectories(featuresDir).filter((name) => name !== 'plan'),
    });
    expect(violations).toEqual([{ kind: 'missing-web-feature', id: 'plan', webFeature: 'plan' }]);
  });

  it('重复 id 会被拦住', () => {
    const first = CAPABILITY_MANIFEST[0];
    if (first === undefined) throw new Error('manifest 为空');
    const violations = validateCapabilities({
      manifest: [first, first],
      directories: [first.id],
      webFeatures: first.webFeature === null ? [] : [first.webFeature],
    });
    expect(violations).toEqual([{ kind: 'duplicate-id', id: first.id }]);
  });

  it('缺读权限会被拦住', () => {
    const violations = validateCapabilities({
      manifest: [{ id: 'x-read-only', readPermissions: [], webFeature: null }],
      directories: ['x-read-only'],
      webFeatures: [],
    });
    expect(violations).toEqual([{ kind: 'missing-read-permission', id: 'x-read-only' }]);
  });
});

function applicationDirectories(): string[] {
  return listDirectories(applicationDir)
    .filter((name) => name !== 'ports' && name !== 'shared')
    .sort();
}

function listDirectories(relative: string): string[] {
  return readdirSync(path.join(root, relative), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
