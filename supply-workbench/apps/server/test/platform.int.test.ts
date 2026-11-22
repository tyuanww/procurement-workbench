import { expect, it } from 'vitest';
import { LATEST_MIGRATION } from '../../../packages/persistence/src/migrate.js';
import { createTestServer } from './helpers/server.js';

it('健康检查报告已应用的迁移，不是写死的成功', async () => {
  const server = await createTestServer();
  const health = await server.app.inject({ method: 'GET', url: '/api/v1/health' });
  expect(health.statusCode).toBe(200);
  expect(health.json()).toEqual({ ok: true, db: 'up', migration: LATEST_MIGRATION });
  await server.close();
});

it('PUT /settings 后审计日志多一条', async () => {
  const server = await createTestServer();
  const cookie = await server.loginAs('admin');
  const before = await server.app.inject({ method: 'GET', url: '/api/v1/audit', headers: { cookie } });
  const saved = await server.app.inject({ method: 'PUT', url: '/api/v1/settings', headers: { cookie }, payload: { upcomingDays: 6 } });
  const after = await server.app.inject({ method: 'GET', url: '/api/v1/audit', headers: { cookie } });
  expect(saved.statusCode).toBe(200);
  expect(after.json().page.total).toBe(before.json().page.total + 1);
  await server.close();
});

it('定时任务调用对应用例，不会空成功', async () => {
  const server = await createTestServer();
  // U02 已接线。导入仓储还是 P02 占位，丢弃任务会失败，不会空成功。
  await expect(trigger(server.triggers, 'discard-stale-imports').run()).rejects.toThrow(/P02/);
  await expect(trigger(server.triggers, 'weekly-report-generate').run()).resolves.toBeUndefined();
  await server.close();
});

function trigger(triggers: readonly { readonly name: string; run(): Promise<void> }[], name: string) {
  const found = triggers.find((item) => item.name === name);
  if (found === undefined) throw new Error(`没有任务 ${name}`);
  return found;
}
