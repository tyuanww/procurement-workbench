import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { TEMPLATE_IDS, templateIdLabel } from '../../packages/domain/src/index.js';
import { commitExecutors } from '../../packages/application/src/imports/commit/index.js';
import '../application/load-import-registry.js';
import type { ImportExisting } from '../../packages/application/src/ports/parsed-rows.js';
import type { WorkbookLike } from '../../packages/application/src/ports/workbook-reader.js';
import { importManifests, templates } from '../../packages/importers/src/registry.js';
import { template as bom } from '../../packages/importers/src/templates/bom-v1/index.js';
import { template as factoryProgress } from '../../packages/importers/src/templates/factory-progress-v1/index.js';
import { template as ownerMap } from '../../packages/importers/src/templates/owner-map-v1/index.js';
import { template as poMaster } from '../../packages/importers/src/templates/po-master-v1/index.js';
import { commitProbe, detectProbe, diffProbe, parseProbe, PROBE_TEMPLATE_ID, testManifests } from './fixtures/probe-registry.js';
import { template as productArchive } from '../../packages/importers/src/templates/product-archive-v1/index.js';

const root = path.resolve(import.meta.dirname, '../..');
const PROBE_HOME = 'test/importers/fixtures/probe-registry.ts';
const REGISTRY = 'packages/importers/src/registry.ts';
const COMMIT_INDEX = 'packages/application/src/imports/commit/index.ts';

it('生产 registry 只登记真实模板，不含探针模板', () => {
  expect(importManifests.map((item) => item.id)).not.toContain('probe-template-v1');
  expect(importManifests.map((item) => item.id)).toEqual([...TEMPLATE_IDS]);
  expect(templates.map((item) => item.id)).toEqual([...TEMPLATE_IDS]);
});

it('提交入口不再手写全部模板 id', () => {
  const text = read(COMMIT_INDEX);
  const listed = TEMPLATE_IDS.filter((id) => text.includes(id));
  expect(listed).toEqual([]);
  expect(text.includes('switch')).toBe(false);
});

it('假模板只出现在测试 fixture 和测试文件里', () => {
  expect(read(REGISTRY)).not.toContain(PROBE_TEMPLATE_ID);
  const hits = sourceFiles().filter((file) => read(file).includes(PROBE_TEMPLATE_ID));
  expect(hits.filter((file) => !isProbeHome(file))).toEqual([]);
});

it('现有 5 个模板仍是原来的对象，提交执行器来自同一份清单', () => {
  expect(templates.map((item) => item.id)).toEqual([...TEMPLATE_IDS]);
  expect(templates.find((item) => item.id === 'po-master-v1')).toBe(poMaster);
  expect(templates.find((item) => item.id === 'factory-progress-v1')).toBe(factoryProgress);
  expect(templates.find((item) => item.id === 'product-archive-v1')).toBe(productArchive);
  expect(templates.find((item) => item.id === 'bom-v1')).toBe(bom);
  expect(templates.find((item) => item.id === 'owner-map-v1')).toBe(ownerMap);
  expect(commitExecutors().map((item) => item.template)).toEqual([...TEMPLATE_IDS]);
  for (const id of TEMPLATE_IDS) {
    const manifest = importManifests.find((item) => item.id === id);
    expect(manifest?.label).toBe(templateIdLabel(id));
    expect(manifest?.importTemplate()).toBe(templates.find((item) => item.id === id));
    expect(manifest?.commit).toBe(commitExecutors().find((item) => item.template === id)?.run);
    expect(manifest?.columns.length).toBeGreaterThan(0);
  }
});

it('探针模板只在测试 registry 里登记，不进入生产识别和提交', () => {
  const probe = testManifests.find((item) => item.id === PROBE_TEMPLATE_ID);
  const book = probeBook();
  const parsed = parseProbe(book, { uploadedAt: '2026-11-10T00:00:00.000Z', factoryPartyId: null });
  expect(probe?.label).toBe('探针模板');
  expect(probe?.columns).toEqual(['探针列']);
  expect(probe?.detect).toBe(detectProbe);
  expect(probe?.commit).toBe(commitProbe);
  expect(probe?.importTemplate()).toBeNull();
  expect(detectProbe(book)).toEqual({ score: 0, reasons: ['探针模板不认 probe.csv'] });
  expect(parsed.template).toBe(PROBE_TEMPLATE_ID);
  expect(diffProbe(parsed, emptyExisting())).toBe(parsed);
  expect(importManifests.map((item) => item.id)).not.toContain(PROBE_TEMPLATE_ID);
  expect(templates.map((item) => item.id).join(',')).not.toContain(PROBE_TEMPLATE_ID);
  expect(commitExecutors().map((item) => item.template).join(',')).not.toContain(PROBE_TEMPLATE_ID);
});

function isProbeHome(file: string): boolean {
  return file === PROBE_HOME || file === 'test/importers/template-registry.test.ts';
}

function probeBook(): WorkbookLike {
  return { source: { kind: 'csv', fileName: 'probe.csv' }, date1904: false, sheets: [] };
}

function emptyExisting(): ImportExisting {
  return { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] };
}

function sourceFiles(): string[] {
  return walk('packages').concat(walk('apps'), walk('test'), walk('e2e'), walk('tools'));
}

function walk(relative: string): string[] {
  const base = path.join(root, relative);
  return readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return walk(child);
    if (!entry.isFile()) return [];
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [child] : [];
  });
}

function read(relative: string): string {
  const full = path.join(root, relative);
  if (!existsSync(full)) return '';
  return readFileSync(full, 'utf8');
}
