import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { localDate, weekStart } from '@sw/domain';
import { ManagementMeetingSchema, WeeklyReportDetailSchema, WeeklyReportSchema } from '@sw/contracts';
import { devAuth } from '@sw/auth';
import { createDb, fileStore, migrate, seed, userDirectory } from '@sw/persistence';
import { composePlatform } from '../src/composition/platform.js';
import { composeReporting } from '../src/composition/reporting.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerPlatformRoutes } from '../src/http/platform/routes.js';
import { registerReportingRoutes } from '../src/http/reporting/routes.js';
import { signPrintToken } from '../src/http/reporting/token.js';
import { loginAs } from './helpers/server.js';
import { FixedClock } from '../../../packages/testkit/src/index.js';

const AT = '2026-10-12T00:00:00.000Z';
const SECRET = '0123456789abcdef0123456789abcdef';
const XLSX = 0x50;

it('总监首页数据要求登录并沿用管理看板读取权限', async () => {
  const brand = '合成品牌';
  const opened = await open({ schedule: async () => ({ brands: [brand], projects: [] }) });
  try {
    const manager = { cookie: await loginAs(opened.app, 'manager') };
    const buyer = { cookie: await loginAs(opened.app, 'buyer') };
    for (const resource of ['schedule', 'brands']) {
      const url = `/api/v1/dashboard/director/${resource}`;
      expect((await opened.app.inject({ url })).statusCode).toBe(401);
      expect((await opened.app.inject({ url, headers: buyer })).statusCode).toBe(403);
      const authorized = await opened.app.inject({ url, headers: manager });
      expect(authorized.statusCode).toBe(200);
      expect(authorized.headers['cache-control']).toBe('private, no-store');
      if (resource === 'schedule') expect(authorized.json()).toEqual({ brands: [brand], projects: [] });
    }
  } finally {
    await opened.close();
  }
});

it('生成周报后可以下载 Excel，过期打印令牌返回 401', async () => {
  const opened = await open();
  const cookie = await loginAs(opened.app, 'manager');
  const monday = weekStart(localDate('2026-10-12'));
  const created = await opened.app.inject({
    method: 'POST',
    url: '/api/v1/reports/weekly',
    headers: { cookie },
    payload: { weekStart: monday },
  });
  expect(created.statusCode).toBe(200);
  const reportId = textOf(created.json(), 'id');
  const exported = await opened.app.inject({
    method: 'POST',
    url: `/api/v1/reports/weekly/${reportId}/exports`,
    headers: { cookie },
    payload: { format: 'xlsx' },
  });
  expect(exported.statusCode).toBe(200);
  const fileId = textOf(exported.json(), 'fileId');
  const downloaded = await opened.app.inject({ method: 'GET', url: `/files/${fileId}`, headers: { cookie } });
  expect(downloaded.statusCode).toBe(200);
  expect(downloaded.rawPayload[0]).toBe(XLSX);
  const expired = signPrintToken({ reportId, secret: SECRET, exp: 1 });
  const denied = await opened.app.inject({ method: 'GET', url: `/api/v1/reports/weekly/${reportId}/print?token=${expired}` });
  expect(denied.statusCode).toBe(401);
  const allowed = await opened.app.inject({ method: 'GET', url: opened.reporting.printUrlFor(reportId) });
  expect(allowed.statusCode).toBe(200);
  expect(textOf(allowed.json(), 'id')).toBe(reportId);
  await opened.close();
});

it('接口导出的 PDF 以 %PDF 开头', async () => {
  const origin = { href: '' };
  const opened = await open({ printOrigin: () => origin.href });
  await opened.app.listen({ port: 0, host: '127.0.0.1' });
  const address = opened.app.server.address();
  if (typeof address !== 'object' || address === null) throw new Error('没有端口');
  origin.href = `http://127.0.0.1:${address.port}`;
  const cookie = await loginAs(opened.app, 'manager');
  const monday = weekStart(localDate('2026-10-12'));
  const created = await opened.app.inject({ method: 'POST', url: '/api/v1/reports/weekly', headers: { cookie }, payload: { weekStart: monday } });
  const reportId = textOf(created.json(), 'id');
  const exported = await opened.app.inject({ method: 'POST', url: `/api/v1/reports/weekly/${reportId}/exports`, headers: { cookie }, payload: { format: 'pdf' } });
  expect(exported.statusCode).toBe(200);
  const downloaded = await opened.app.inject({ method: 'GET', url: `/files/${textOf(exported.json(), 'fileId')}`, headers: { cookie } });
  expect(downloaded.statusCode).toBe(200);
  expect(downloaded.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  await opened.close();
}, 120000);

it('管理周会按店铺读取当前事实，周报冻结该版事实并沿用现有读写权限', async () => {
  const monday = localDate('2026-10-12');
  let reply = '供应商确认周三到厂';
  const opened = await open({
    loadDevelopment: async (_db, input) => input.store === 'dafuyan' ? [{
      id: 'test-node', name: '中试原料', projectName: '示例项目', plannedEnd: monday, destination: 'factory',
      ownerName: '采购甲', latestReply: { text: reply, recordedAt: AT },
    }] : [],
  });
  try {
    const manager = { cookie: await loginAs(opened.app, 'manager') };
    const lead = { cookie: await loginAs(opened.app, 'lead') };
    const buyer = { cookie: await loginAs(opened.app, 'buyer') };
    const url = `/api/v1/dashboard/management-meeting?store=dafuyan&weekStart=${monday}`;
    const original = await opened.app.inject({ method: 'GET', url, headers: lead });
    expect(ManagementMeetingSchema.parse(original.json()).development[0]?.latestReply?.text).toBe(reply);
    expect((await opened.app.inject({ method: 'GET', url, headers: buyer })).statusCode).toBe(403);
    const generate = { method: 'POST' as const, url: '/api/v1/reports/weekly', payload: { weekStart: monday } };
    expect((await opened.app.inject({ ...generate, headers: lead })).statusCode).toBe(403);
    const initial = WeeklyReportSchema.parse((await opened.app.inject({ ...generate, headers: manager })).json());
    reply = '供应商改为周五到厂';
    const current = WeeklyReportSchema.parse((await opened.app.inject({ ...generate, headers: manager })).json());
    expect(current.id).not.toBe(initial.id);
    expect(current.data.managementMeeting?.find((store) => store.store === 'dafuyan')?.development[0]?.latestReply?.text).toBe(reply);
    expect(current.data.managementMeeting?.find((store) => store.store === 'yiling')?.development).toEqual([]);
    const old = await opened.app.inject({ method: 'GET', url: `${generate.url}/${initial.id}`, headers: lead });
    expect(WeeklyReportDetailSchema.parse(old.json()).data).toEqual(initial.data);
    const printed = await opened.app.inject({ url: opened.reporting.printUrlFor(initial.id), headers: { accept: 'text/html' } });
    expect(printed.statusCode).toBe(200);
    expect(printed.body).toContain('供应商确认周三到厂');
    expect(printed.body).not.toContain(reply);
  } finally {
    await opened.close();
  }
});

async function open(extra: Pick<Parameters<typeof composeReporting>[0], 'printOrigin' | 'loadDevelopment' | 'schedule'> = {}) {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-report-'));
  const files = fileStore(uploadDir);
  const clock = new FixedClock(AT);
  const reporting = composeReporting({ db: handle.db, files, timeZone: 'Asia/Shanghai', secret: SECRET, clock, ...extra });
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
  return { app, reporting, close: async () => { await app.close(); await handle.close(); await rm(uploadDir, { recursive: true }); } };
}

function textOf(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null || !(key in value)) throw new Error(`没有 ${key}`);
  const field = Reflect.get(value, key);
  if (typeof field !== 'string') throw new Error(`没有 ${key}`);
  return field;
}
