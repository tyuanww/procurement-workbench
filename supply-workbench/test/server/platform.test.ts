import { expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { localDate } from '../../packages/domain/src/index.js';
import { makeCreateUser, makeGetFreshness, makeGetSettings, makeListAuditEntries, makeListUsers, makeUpdateSettings, makeUpdateUser } from '../../packages/application/src/platform/index.js';
import { devAuth } from '../../packages/auth/src/index.js';
import { aUser, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import { loadConfig } from '../../apps/server/src/config.js';
import { platformTriggers, registerJobs } from '../../apps/server/src/jobs/runner.js';
import { buildHttpApp } from '../../apps/server/src/http/app.js';
import { registerPlatformRoutes } from '../../apps/server/src/http/platform/routes.js';
import type { PlatformApi } from '../../apps/server/src/http/platform-api.js';
import '../../apps/server/test/boss.learn.test.js';

const SECRET = '0123456789abcdef0123456789abcdef';
const CODE = 'dev-code';

function memoryApi() {
  const memory = createMemory();
  const clock = new FixedClock('2026-10-12T00:00:00.000Z');
  const ids = new SequentialIds();
  const write = { uow: memory.unitOfWork, clock, ids };
  const api: PlatformApi = {
    health: async () => ({ ok: true, db: 'up', migration: '0000_init' }),
    getSettings: makeGetSettings({ settings: memory.stores.settings }),
    updateSettings: makeUpdateSettings({ ...write, settings: memory.stores.settings }),
    listUsers: makeListUsers({ users: memory.stores.users }),
    createUser: makeCreateUser(write),
    updateUser: makeUpdateUser(write),
    listAudit: makeListAuditEntries({ audit: { list: async () => ({ items: [], page: { page: 1, pageSize: 50, total: 0 } }) } }),
    getFreshness: makeGetFreshness({ freshness: { load: async () => ({ sources: [] }) } }),
    files: memory.files,
  };
  return { memory, api };
}

async function appOf(input: { readonly api: PlatformApi; readonly directory: ReturnType<typeof createMemory>['directory']; readonly devLogin?: boolean }) {
  return buildHttpApp({
    auth: devAuth({ directory: input.directory, accessCode: CODE, secret: SECRET }),
    register: (server) => registerPlatformRoutes({ app: server, api: input.api, devLogin: input.devLogin !== false, businessTimeZone: 'Asia/Shanghai' }),
  });
}

it('AUTH_MODE=dev 但没有 DEV_ACCESS_CODE 时启动失败', () => {
  expect(() => loadConfig({ DATABASE_URL: 'postgres://localhost/db', AUTH_MODE: 'dev', SESSION_SECRET: SECRET, ALLOW_DEV_LOGIN: 'enabled' })).toThrow(/DEV_ACCESS_CODE/);
});

it('健康检查成功，未登录不能看设置，未知字段被拒绝', async () => {
  const { memory, api } = memoryApi();
  const admin = aUser({ roles: ['admin'], name: '管理员' });
  const buyer = aUser({ roles: ['buyer'], name: '采购甲' });
  await memory.stores.users.save(admin);
  await memory.stores.users.save(buyer);
  const app = await appOf({ api, directory: memory.directory });
  expect((await app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode).toBe(200);
  expect((await app.inject({ method: 'GET', url: '/api/v1/settings' })).statusCode).toBe(401);
  const badLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: admin.id, accessCode: CODE, extra: true } });
  expect(badLogin.statusCode).toBe(400);
  const wrongCode = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: admin.id, accessCode: 'nope' } });
  expect(wrongCode.statusCode).toBe(401);
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: admin.id, accessCode: CODE } });
  expect(login.statusCode).toBe(200);
  const cookie = cookieOf(login.headers['set-cookie']);
  const denied = await app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { cookie: await cookieFor(app, buyer.id) }, payload: { upcomingDays: 4 } });
  expect(denied.statusCode).toBe(403);
  const extra = await app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { cookie }, payload: { upcomingDays: 4, extra: true } });
  expect(extra.statusCode).toBe(400);
  expect(extra.json().error.code).toBe('VALIDATION_FAILED');
  const saved = await app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { cookie }, payload: { upcomingDays: 4 } });
  expect(saved.statusCode).toBe(200);
  expect(saved.json().upcomingDays).toBe(4);
  expect((await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'GET', url: '/api/v1/auth/dev/users' })).statusCode).toBe(401);
  expect((await app.inject({ method: 'GET', url: '/api/v1/auth/dev/users', headers: { cookie } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'GET', url: '/api/v1/meta/freshness', headers: { cookie } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie: await cookieFor(app, buyer.id) } })).statusCode).toBe(403);
  expect((await app.inject({ method: 'GET', url: '/api/v1/users', headers: { cookie } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie }, payload: { name: ' ', roles: ['buyer'] } })).statusCode).toBe(400);
  expect((await app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie }, payload: { name: '新人', roles: ['buyer'], extra: true } })).statusCode).toBe(400);
  expect((await app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie }, payload: { name: '新人', roles: ['buyer'] } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'GET', url: '/api/v1/audit?pageSize=201', headers: { cookie } })).statusCode).toBe(400);
  expect((await app.inject({ method: 'GET', url: '/api/v1/audit', headers: { cookie: await cookieFor(app, buyer.id) } })).statusCode).toBe(403);
  expect((await app.inject({ method: 'GET', url: '/api/v1/audit', headers: { cookie } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'GET', url: '/files/missing' })).statusCode).toBe(401);
  expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } })).statusCode).toBe(204);
  await app.close();
});

it('健康检查 ok:false 时返回 503，响应体结构不变', async () => {
  const { memory, api } = memoryApi();
  const degraded: PlatformApi = { ...api, health: async () => ({ ok: false, db: 'down', migration: 'unknown' }) };
  const app = await appOf({ api: degraded, directory: memory.directory });
  const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
  expect(response.statusCode).toBe(503);
  expect(response.json()).toEqual({ ok: false, db: 'down', migration: 'unknown' });
  await app.close();
});

it('dev 登录连续失败会被限流', async () => {
  const { memory, api } = memoryApi();
  const app = await appOf({ api, directory: memory.directory });
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', remoteAddress: '10.0.0.9', payload: { userId: 'admin', accessCode: 'wrong' } });
      expect(failed.statusCode).toBe(401);
    }
    const limited = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', remoteAddress: '10.0.0.9', payload: { userId: 'admin', accessCode: CODE } });
    expect(limited.statusCode).toBe(429);
  } finally {
    await app.close();
  }
});

it('登录后返回单一业务时区会话元数据', async () => {
  const { memory, api } = memoryApi();
  const manager = aUser({ roles: ['manager'], name: '经理' });
  await memory.stores.users.save(manager);
  const app = await appOf({ api, directory: memory.directory });
  const cookie = await cookieFor(app, manager.id);
  const response = await app.inject({ method: 'GET', url: '/api/v1/meta/session', headers: { cookie } });
  expect(response.statusCode).toBe(200);
  expect(response.json().businessTimeZone).toBe('Asia/Shanghai');
  expect(response.json().businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await app.close();
});

it('开发登录关闭时当前用户带 false，登录体没有这个字段', async () => {
  const { memory, api } = memoryApi();
  const admin = aUser({ roles: ['admin'], name: '管理员' });
  await memory.stores.users.save(admin);
  const app = await appOf({ api, directory: memory.directory, devLogin: false });
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: admin.id, accessCode: CODE } });
  expect(login.statusCode).toBe(200);
  expect(Object.keys(login.json()).sort()).toEqual(['id', 'name', 'roles']);
  const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: cookieOf(login.headers['set-cookie']) } });
  expect(me.json()).toEqual({ id: admin.id, name: '管理员', roles: ['admin'], devLogin: false });
  await app.close();
});

it('没有排期的任务不注册', async () => {
  const scheduled: string[] = [];
  await registerJobs({
    schedule: async ({ name }) => {
      scheduled.push(name);
    },
  }, [
    { name: 'discard-stale-imports', cron: '0 3 * * *', run: async () => undefined },
    { name: 'weekly-report-generate', cron: null, run: async () => undefined },
  ]);
  expect(scheduled).toEqual(['discard-stale-imports']);
});

it('周报任务传上一周的周一', async () => {
  let week = '';
  await registerJobs({
    schedule: async ({ run }) => {
      await run();
    },
  }, platformTriggers({
    weeklyCron: '0 8 * * 1',
    today: () => localDate('2026-10-14'),
    discardStale: async () => undefined,
    generateWeekly: async (start) => {
      week = start;
    },
  }));
  expect(week).toBe('2026-10-05');
});

it('未登录不能登出，采购员不能改用户', async () => {
  const { memory, api } = memoryApi();
  const admin = aUser({ roles: ['admin'], name: '管理员' });
  const buyer = aUser({ roles: ['buyer'], name: '采购甲' });
  await memory.stores.users.save(admin);
  await memory.stores.users.save(buyer);
  const app = await appOf({ api, directory: memory.directory });
  expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout' })).statusCode).toBe(401);
  const cookie = await cookieFor(app, admin.id);
  const buyerCookie = await cookieFor(app, buyer.id);
  expect((await app.inject({ method: 'POST', url: '/api/v1/users', headers: { cookie: buyerCookie }, payload: { name: '新人', roles: ['buyer'] } })).statusCode).toBe(403);
  expect((await app.inject({ method: 'PATCH', url: `/api/v1/users/${buyer.id}`, headers: { cookie: buyerCookie }, payload: { name: '改名' } })).statusCode).toBe(403);
  expect((await app.inject({ method: 'PATCH', url: `/api/v1/users/${buyer.id}`, headers: { cookie }, payload: { name: '改名', extra: true } })).json().error.code).toBe('VALIDATION_FAILED');
  const renamed = await app.inject({ method: 'PATCH', url: `/api/v1/users/${buyer.id}`, headers: { cookie }, payload: { name: '改名' } });
  expect(renamed.statusCode).toBe(200);
  expect(renamed.json().name).toBe('改名');
  expect((await app.inject({ method: 'GET', url: '/api/v1/settings', headers: { cookie: buyerCookie } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'GET', url: '/api/v1/settings?extra=1', headers: { cookie } })).statusCode).toBe(400);
  expect((await app.inject({ method: 'GET', url: '/api/v1/health?extra=1' })).statusCode).toBe(400);
  expect((await app.inject({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(401);
  expect((await app.inject({ method: 'GET', url: '/api/v1/meta/freshness' })).statusCode).toBe(401);
  await app.close();
});

it('登录后可以下载已存文件，没有的文件返回 404', async () => {
  const { memory, api } = memoryApi();
  const admin = aUser({ roles: ['admin'], name: '管理员' });
  await memory.stores.users.save(admin);
  const stored = await memory.files.put({ bytes: Uint8Array.from([1, 2, 3]), originalName: 'a.bin', mime: 'application/octet-stream' });
  const app = await appOf({ api, directory: memory.directory });
  const cookie = await cookieFor(app, admin.id);
  const found = await app.inject({ method: 'GET', url: `/files/${stored.sha256}`, headers: { cookie } });
  expect(found.statusCode).toBe(200);
  expect(found.headers['content-type']).toContain('application/octet-stream');
  expect(Buffer.from(found.rawPayload)).toEqual(Buffer.from([1, 2, 3]));
  expect((await app.inject({ method: 'GET', url: '/files/missing', headers: { cookie } })).statusCode).toBe(404);
  expect((await app.inject({ method: 'GET', url: `/files/${stored.sha256}?extra=1`, headers: { cookie } })).statusCode).toBe(400);
  await app.close();
});

it('生产环境托管前端构建产物，不挡住接口和文件', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sw-web-'));
  await writeFile(path.join(dir, 'index.html'), '<p>工作台</p>');
  await writeFile(path.join(dir, 'app.js'), 'console.log(1)');
  const { memory, api } = memoryApi();
  const app = await buildHttpApp({
    auth: devAuth({ directory: memory.directory, accessCode: CODE, secret: SECRET }),
    register: (server) => registerPlatformRoutes({ app: server, api, devLogin: true, businessTimeZone: 'Asia/Shanghai' }),
    serveWebDir: dir,
  });
  const home = await app.inject({ method: 'GET', url: '/' });
  expect(home.statusCode).toBe(200);
  expect(home.body).toContain('工作台');
  expect(home.headers['content-type']).toContain('text/html');
  expect((await app.inject({ method: 'GET', url: '/today' })).body).toContain('工作台');
  expect((await app.inject({ method: 'GET', url: '/missing.js' })).statusCode).toBe(404);
  expect((await app.inject({ method: 'GET', url: '/%2e%2e/secret.txt' })).statusCode).toBe(404);
  expect((await app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode).toBe(200);
  expect((await app.inject({ method: 'GET', url: '/files/missing' })).statusCode).toBe(401);
  await app.close();
  await rm(dir, { recursive: true });
});

function cookieOf(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(';')[0] ?? '';
}

async function cookieFor(app: Awaited<ReturnType<typeof buildHttpApp>>, userId: string): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId, accessCode: CODE } });
  return cookieOf(login.headers['set-cookie']);
}
