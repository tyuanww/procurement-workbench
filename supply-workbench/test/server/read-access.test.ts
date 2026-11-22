import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_MANIFEST } from '../../packages/contracts/src/index.js';
import { canRead, readAccessOf, READ_ACCESS_RULES, uncoveredRoutes } from '../../apps/server/src/http/read-access.js';

const root = path.resolve(import.meta.dirname, '../..');

describe('读权限矩阵', () => {
  it('公开接口不要求权限', () => {
    expect(readAccessOf('/api/v1/health')).toEqual({ kind: 'public' });
    expect(readAccessOf('/api/v1/meta/auth')).toEqual({ kind: 'public' });
    expect(readAccessOf('/api/v1/auth/feishu/start')).toEqual({ kind: 'public' });
  });

  it('能力前缀映射到能力清单里的读权限', () => {
    expect(readAccessOf('/api/v1/dashboard/stuck')).toEqual({ kind: 'permission', action: 'dashboard.read' });
    expect(readAccessOf('/api/v1/reports/weekly')).toEqual({ kind: 'permission', action: 'reports.read' });
    expect(readAccessOf('/api/v1/master/aliases')).toEqual({ kind: 'permission', action: 'master.read' });
    expect(readAccessOf('/api/v1/imports')).toEqual({ kind: 'permission', action: 'imports.read' });
    expect(readAccessOf('/api/v1/plan/daily')).toEqual({ kind: 'permission', action: 'plan.read' });
    expect(readAccessOf('/api/v1/products')).toEqual({ kind: 'permission', action: 'products.read' });
    expect(readAccessOf('/api/v1/lines')).toEqual({ kind: 'permission', action: 'data.read' });
    expect(readAccessOf('/api/v1/owners/coverage')).toEqual({ kind: 'permission', action: 'data.read' });
    expect(readAccessOf('/api/v1/users')).toEqual({ kind: 'permission', action: 'admin' });
  });

  it('角色按矩阵读', () => {
    expect(canRead({ roles: ['buyer'] }, '/api/v1/dashboard/stuck')).toBe(false);
    expect(canRead({ roles: ['manager'] }, '/api/v1/dashboard/stuck')).toBe(true);
    expect(canRead({ roles: ['buyer'] }, '/api/v1/master/aliases')).toBe(false);
    expect(canRead({ roles: ['reviewer'] }, '/api/v1/master/aliases')).toBe(true);
    expect(canRead({ roles: ['buyer'] }, '/api/v1/lines')).toBe(true);
  });

  it('未知路径直接拒绝，不回落 data.read', () => {
    expect(readAccessOf('/api/v1/not-registered')).toEqual({ kind: 'unknown' });
    expect(canRead({ roles: ['admin'] }, '/api/v1/not-registered')).toBe(false);
  });

  it('所有已注册的 GET 路由都在矩阵里', () => {
    expect(uncoveredRoutes(registeredGetRoutes())).toEqual([]);
  });

  it('新增一条未知前缀的 GET 路由会被报出来', () => {
    expect(uncoveredRoutes([...registeredGetRoutes(), '/api/v1/x-fixture/rows'])).toEqual(['/api/v1/x-fixture/rows']);
  });

  it('矩阵的能力 id、权限和前缀都来自能力清单', () => {
    const byId = new Map(CAPABILITY_MANIFEST.map((entry) => [entry.id, entry]));
    for (const rule of READ_ACCESS_RULES) {
      if (rule.access.kind === 'public') continue;
      const entry = byId.get(rule.access.capability);
      expect(entry, rule.prefix).toBeDefined();
      expect(entry?.readPermissions, rule.prefix).toContain(rule.access.action);
    }
    for (const entry of CAPABILITY_MANIFEST) {
      for (const prefix of entry.routePrefixes) {
        const isCovered = READ_ACCESS_RULES.some((rule) => rule.prefix === prefix || rule.prefix.startsWith(`${prefix}/`));
        expect(isCovered, `${entry.id} ${prefix}`).toBe(true);
      }
    }
  });
});

function registeredGetRoutes(): readonly string[] {
  const sources = [...sourceFiles('apps/server/src/http'), 'packages/auth/src/index.ts'];
  const routes = new Set<string>();
  for (const file of sources) {
    for (const match of readFileSync(path.join(root, file), 'utf8').matchAll(/app\.get\('(\/api\/v1\/[^']+)'/g)) {
      const route = match[1];
      if (route !== undefined) routes.add(route);
    }
  }
  return [...routes];
}

function sourceFiles(relative: string): readonly string[] {
  const base = path.join(root, relative);
  return readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    return entry.isFile() && entry.name.endsWith('.ts') ? [child] : [];
  });
}
