import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { devAuth } from '../packages/auth/src/index.js';
import type { Role } from '../packages/domain/src/vocabulary/identity.js';
import { createDb, fileStore, migrate, seed, userDirectory, type AppHandle } from '../packages/persistence/src/index.js';
import { composeMasterData } from '../apps/server/src/composition/master-data.js';
import { composePerformance } from '../apps/server/src/composition/performance.js';
import { composePlatform } from '../apps/server/src/composition/platform.js';
import { composeReporting } from '../apps/server/src/composition/reporting.js';
import { buildHttpApp, type HttpApp } from '../apps/server/src/http/app.js';
import { registerMasterDataRoutes } from '../apps/server/src/http/master-data/routes.js';
import { registerPerformanceRoutes } from '../apps/server/src/http/performance/routes.js';
import { registerPlatformRoutes } from '../apps/server/src/http/platform/routes.js';
import { registerReportingRoutes } from '../apps/server/src/http/reporting/routes.js';

const ACCESS_CODE = 'dev-code';
const SECRET = '0123456789abcdef0123456789abcdef';
const ROLE_USER: Record<Role, string> = {
  admin: '0199f0a0-0000-7000-8000-000000000001',
  buyer: '0199f0a0-0000-7000-8000-000000000002',
  reviewer: '0199f0a0-0000-7000-8000-000000000004',
  manager: '0199f0a0-0000-7000-8000-000000000005',
  lead: '0199f0a0-0000-7000-8000-000000000006',
};

it('治理基线拒绝未登录和非管理角色读取看板与周报', async () => {
  const opened = await open();
  try {
    const anonymous = await opened.app.inject({ method: 'GET', url: dashboardUrl() });
    expect(anonymous.statusCode).toBe(401);

    for (const role of ['buyer', 'reviewer'] as const) {
      const cookie = await loginAs(opened.app, role);
      for (const route of ['/api/v1/dashboard/stuck', '/api/v1/dashboard/suppliers', '/api/v1/dashboard/buyers']) {
        const response = await opened.app.inject({ method: 'GET', url: `${route}?from=2026-10-01&to=2026-10-31`, headers: { cookie } });
        expect(response.statusCode, `${role} ${route}: ${response.body}`).toBe(403);
      }
      const reports = await opened.app.inject({ method: 'GET', url: '/api/v1/reports/weekly', headers: { cookie } });
      expect(reports.statusCode, `${role} reports: ${reports.body}`).toBe(403);
    }
  } finally {
    await opened.close();
  }
});

it('治理基线允许管理层读取看板和周报', async () => {
  const opened = await open();
  try {
    for (const role of ['manager', 'lead'] as const) {
      const cookie = await loginAs(opened.app, role);
      const dashboard = await opened.app.inject({ method: 'GET', url: dashboardUrl(), headers: { cookie } });
      const reports = await opened.app.inject({ method: 'GET', url: '/api/v1/reports/weekly', headers: { cookie } });
      expect(dashboard.statusCode, `${role} dashboard: ${dashboard.body}`).toBe(200);
      expect(reports.statusCode, `${role} reports: ${reports.body}`).toBe(200);
    }
  } finally {
    await opened.close();
  }
});

it('主数据读权限对 buyer 和 manager 是 403，reviewer 是 200', async () => {
  const opened = await open();
  try {
    for (const role of ['buyer', 'manager'] as const) {
      const cookie = await loginAs(opened.app, role);
      const response = await opened.app.inject({ method: 'GET', url: '/api/v1/master/aliases', headers: { cookie } });
      expect(response.statusCode, `${role}: ${response.body}`).toBe(403);
    }
    const reviewer = await loginAs(opened.app, 'reviewer');
    const allowed = await opened.app.inject({ method: 'GET', url: '/api/v1/master/aliases', headers: { cookie: reviewer } });
    expect(allowed.statusCode, allowed.body).toBe(200);
  } finally {
    await opened.close();
  }
});

it('治理基线覆盖周报生成与导出写操作', async () => {
  const opened = await open();
  try {
    for (const role of ['buyer', 'reviewer', 'lead'] as const) {
      const cookie = await loginAs(opened.app, role);
      const generated = await opened.app.inject({ method: 'POST', url: '/api/v1/reports/weekly', headers: { cookie }, payload: { weekStart: '2026-10-12' } });
      expect(generated.statusCode, `${role} generate: ${generated.body}`).toBe(403);
    }
    const manager = await loginAs(opened.app, 'manager');
    const generated = await opened.app.inject({ method: 'POST', url: '/api/v1/reports/weekly', headers: { cookie: manager }, payload: { weekStart: '2026-10-12' } });
    expect(generated.statusCode, generated.body).toBe(200);
    const reportId = String(generated.json().id);
    for (const role of ['buyer', 'reviewer'] as const) {
      const cookie = await loginAs(opened.app, role);
      const denied = await opened.app.inject({ method: 'POST', url: `/api/v1/reports/weekly/${reportId}/exports`, headers: { cookie }, payload: { format: 'xlsx' } });
      expect(denied.statusCode, `${role} export: ${denied.body}`).toBe(403);
    }
    const lead = await loginAs(opened.app, 'lead');
    const exported = await opened.app.inject({ method: 'POST', url: `/api/v1/reports/weekly/${reportId}/exports`, headers: { cookie: lead }, payload: { format: 'xlsx' } });
    expect(exported.statusCode, exported.body).toBe(200);
    const managerExport = await opened.app.inject({ method: 'POST', url: `/api/v1/reports/weekly/${reportId}/exports`, headers: { cookie: manager }, payload: { format: 'xlsx' } });
    expect(managerExport.statusCode, managerExport.body).toBe(200);
  } finally {
    await opened.close();
  }
});

it('周报打印页包含冻结报告的八个业务章节', async () => {
  const opened = await open();
  try {
    const cookie = await loginAs(opened.app, 'manager');
    const created = await opened.app.inject({ method: 'POST', url: '/api/v1/reports/weekly', headers: { cookie }, payload: { weekStart: '2026-10-12' } });
    expect(created.statusCode, created.body).toBe(200);
    const reportId = String(created.json().id);
    const printed = await opened.app.inject({ method: 'GET', url: opened.reporting.printUrlFor(reportId), headers: { accept: 'text/html' } });
    expect(printed.statusCode, printed.body).toBe(200);
    for (const section of ['overview', 'risks', 'stuck', 'suppliers', 'buyers', 'exceptions', 'due-next-week', 'notes']) {
      expect(printed.body).toContain(`data-section="${section}"`);
    }
  } finally {
    await opened.close();
  }
});

it('文件读取拒绝路径穿越，dev 用户列表只允许管理员', async () => {
  const opened = await open();
  try {
    const buyer = await loginAs(opened.app, 'buyer');
    for (const path of ['/files/..%2F..%2F..%2Fetc%2Fpasswd', '/files/%2e%2e%2F%2e%2e%2Fetc%2Fpasswd', '/files/' + 'a'.repeat(64)]) {
      const response = await opened.app.inject({ method: 'GET', url: path, headers: { cookie: buyer } });
      expect(response.statusCode, path).toBe(404);
    }
    const anonymous = await opened.app.inject({ method: 'GET', url: '/api/v1/auth/dev/users' });
    expect(anonymous.statusCode).toBe(401);
    const denied = await opened.app.inject({ method: 'GET', url: '/api/v1/auth/dev/users', headers: { cookie: buyer } });
    expect(denied.statusCode).toBe(403);
    const admin = await loginAs(opened.app, 'admin');
    const allowed = await opened.app.inject({ method: 'GET', url: '/api/v1/auth/dev/users', headers: { cookie: admin } });
    expect(allowed.statusCode).toBe(200);
  } finally {
    await opened.close();
  }
});

function dashboardUrl(): string {
  return '/api/v1/dashboard/stuck?from=2026-10-01&to=2026-10-31';
}

async function open(): Promise<{ readonly app: HttpApp; readonly reporting: ReturnType<typeof composeReporting>; readonly close: () => Promise<void> }> {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-governance-'));
  const files = fileStore(uploadDir);
  const platform = composePlatform({ db: handle.db, timeZone: 'Asia/Shanghai', weeklyCron: null, files, health: async () => ({ ok: true, db: 'up' as const, migration: 'test' }) });
  const master = composeMasterData({ db: handle.db, timeZone: 'Asia/Shanghai' });
  const performance = composePerformance({ db: handle.db, timeZone: 'Asia/Shanghai' });
  const reporting = composeReporting({ db: handle.db, files, timeZone: 'Asia/Shanghai', secret: SECRET });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: ACCESS_CODE, secret: SECRET }),
    register: (server) => {
      registerPlatformRoutes({ app: server, api: platform.api, devLogin: true, businessTimeZone: 'Asia/Shanghai' });
      registerMasterDataRoutes(server, master);
      registerPerformanceRoutes(server, performance);
      registerReportingRoutes(server, reporting);
    },
  });
  return { app, reporting, close: () => close({ app, handle, uploadDir }) };
}

async function loginAs(app: HttpApp, role: Role): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: ROLE_USER[role], accessCode: ACCESS_CODE } });
  expect(response.statusCode, response.body).toBe(200);
  const header = response.headers['set-cookie'];
  const cookie = Array.isArray(header) ? header[0] : header;
  expect(cookie).toBeTruthy();
  return cookie?.split(';')[0] ?? '';
}

async function close(input: { readonly app: HttpApp; readonly handle: AppHandle; readonly uploadDir: string }): Promise<void> {
  await input.app.close();
  await input.handle.close();
  await rm(input.uploadDir, { recursive: true, force: true });
}
