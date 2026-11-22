import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { localDate, weekStart } from '@sw/domain';
import { devAuth } from '@sw/auth';
import { createDb, fileStore, migrate, seed, userDirectory } from '@sw/persistence';
import { feishuApp, type FeishuApp } from '../src/config.js';
import { composePlatform } from '../src/composition/platform.js';
import { composeReporting } from '../src/composition/reporting.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerPlatformRoutes } from '../src/http/platform/routes.js';
import { registerReportingRoutes } from '../src/http/reporting/routes.js';
import { loginAs } from './helpers/server.js';
import { FixedClock } from '../../../packages/testkit/src/index.js';

const AT = '2026-10-12T00:00:00.000Z';
const SECRET = '0123456789abcdef0123456789abcdef';
const APP: FeishuApp = { appId: 'feishu-app', appSecret: 'feishu-secret', folderToken: 'feishu-folder' };

it('三项都有才算配置了飞书应用', () => {
  const present = { FEISHU_APP_ID: 'app', FEISHU_APP_SECRET: 'secret', FEISHU_REPORT_FOLDER_TOKEN: 'folder' };
  expect(feishuApp(present)).toEqual({ appId: 'app', appSecret: 'secret', folderToken: 'folder' });
  expect(feishuApp({ ...present, FEISHU_APP_ID: undefined })).toBeUndefined();
  expect(feishuApp({ ...present, FEISHU_APP_SECRET: '' })).toBeUndefined();
  expect(feishuApp({ ...present, FEISHU_REPORT_FOLDER_TOKEN: undefined })).toBeUndefined();
});

it('没配置时详情标为未配置，写入飞书是 409 且没有文档链接', async () => {
  const opened = await open();
  const cookie = await loginAs(opened.app, 'manager');
  const reportId = await createReport(opened.app, cookie);
  const detail = await opened.app.inject({ method: 'GET', url: `/api/v1/reports/weekly/${reportId}`, headers: { cookie } });
  expect(detail.statusCode).toBe(200);
  expect(detail.json().feishuConfigured).toBe(false);
  const published = await opened.app.inject({ method: 'POST', url: `/api/v1/reports/weekly/${reportId}/feishu`, headers: { cookie } });
  expect(published.statusCode).toBe(409);
  expect(published.json().error.code).toBe('FEISHU_NOT_CONFIGURED');
  expect(JSON.stringify(published.json())).not.toContain('docUrl');
  await opened.close();
});

it('三项都配置时写入返回文档链接，响应里没有密钥', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = feishuFetch;
  const opened = await open(APP);
  try {
    const cookie = await loginAs(opened.app, 'manager');
    const reportId = await createReport(opened.app, cookie);
    const detail = await opened.app.inject({ method: 'GET', url: `/api/v1/reports/weekly/${reportId}`, headers: { cookie } });
    expect(detail.json().feishuConfigured).toBe(true);
    expect(textOf(detail.json())).not.toContain('feishu-secret');
    const published = await opened.app.inject({ method: 'POST', url: `/api/v1/reports/weekly/${reportId}/feishu`, headers: { cookie } });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toEqual({ docUrl: 'https://open.feishu.cn/docx/doc-1' });
    expect(textOf(published.json())).not.toContain('feishu-secret');
    expect(textOf(published.json())).not.toContain('feishu-app');
    expect(textOf(published.json())).not.toContain('feishu-folder');
  } finally {
    globalThis.fetch = previous;
    await opened.close();
  }
});

async function createReport(app: Awaited<ReturnType<typeof open>>['app'], cookie: string): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/reports/weekly',
    headers: { cookie },
    payload: { weekStart: weekStart(localDate('2026-10-12')) },
  });
  return textField(created.json(), 'id');
}

async function open(feishu?: FeishuApp) {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-feishu-'));
  const files = fileStore(uploadDir);
  const reporting = composeReporting({
    db: handle.db,
    files,
    timeZone: 'Asia/Shanghai',
    secret: SECRET,
    clock: new FixedClock(AT),
    ...(feishu === undefined ? {} : { feishu }),
  });
  const platform = composePlatform({
    db: handle.db,
    timeZone: 'Asia/Shanghai',
    weeklyCron: null,
    files,
    health: async () => ({ ok: true, db: 'up' as const, migration: 'test' }),
  });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: SECRET }),
    register: (server) => {
      registerPlatformRoutes({ app: server, api: platform.api, devLogin: true, businessTimeZone: 'Asia/Shanghai' });
      registerReportingRoutes(server, reporting);
    },
  });
  return { app, close: async () => { await app.close(); await handle.close(); await rm(uploadDir, { recursive: true }); } };
}

function feishuFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('tenant_access_token')) return feishuJson({ code: 0, tenant_access_token: 'token' });
  if (url.endsWith('/documents')) return feishuJson({ code: 0, data: { document: { document_id: 'doc-1' } } });
  return feishuJson({ code: 0 });
}

function feishuJson(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
}

function textOf(value: unknown): string {
  return JSON.stringify(value);
}

function textField(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null || !(key in value)) throw new Error(`没有 ${key}`);
  const field = Reflect.get(value, key);
  if (typeof field !== 'string') throw new Error(`没有 ${key}`);
  return field;
}
