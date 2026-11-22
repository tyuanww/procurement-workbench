import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { devAuth } from '@sw/auth';
import { createDb, migrate, seed, userDirectory } from '@sw/persistence';
import { composePerformance } from '../src/composition/performance.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerPerformanceRoutes } from '../src/http/performance/routes.js';
import { insertSample } from './helpers/kpi-sample.js';
import { loginAs } from './helpers/server.js';
import { FixedClock } from '../../../packages/testkit/src/index.js';

const at = '2026-10-12T00:00:00.000Z';
const from = '2026-10-01';
const to = '2026-10-31';

it('D04 手算样例写进库后，三个看板接口与期望一致', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-perf-'));
  await insertSample(handle.db);
  const api = composePerformance({ db: handle.db, timeZone: 'Asia/Shanghai', clock: new FixedClock(at) });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => registerPerformanceRoutes(server, api),
  });
  const cookie = await loginAs(app, 'manager');
  const query = `from=${from}&to=${to}`;
  const stuck = await app.inject({ method: 'GET', url: `/api/v1/dashboard/stuck?${query}`, headers: { cookie } });
  const suppliers = await app.inject({ method: 'GET', url: `/api/v1/dashboard/suppliers?${query}`, headers: { cookie } });
  const buyers = await app.inject({ method: 'GET', url: `/api/v1/dashboard/buyers?${query}`, headers: { cookie } });
  expect(stuck.statusCode).toBe(200);
  expect(stuck.json().kpis).toMatchObject({ openBatches: 6, overdue: 2, awaitingDate: 0, shippedNotReceived: 0 });
  expect(stuck.json().distribution.find((row: { stage: string }) => row.stage === 'confirmed').buckets).toMatchObject({ '8-14': 1, '15+': 1 });
  expect(suppliers.json().rows[0]).toMatchObject({ displayName: '宜侬', dueBatches: { numerator: 10 }, onTime: { numerator: 2, denominator: 8 } });
  expect(buyers.json().rows[0]).toMatchObject({ buyer: { id: 'buyer-1' }, openLines: 1, openBatches: 6, followUpsInPeriod: 1 });
  const buyerCookie = await loginAs(app, 'buyer');
  const forbidden = await app.inject({ method: 'GET', url: `/api/v1/dashboard/stuck?${query}`, headers: { cookie: buyerCookie } });
  expect(forbidden.statusCode).toBe(403);
  expect(forbidden.json().error.code).toBe('FORBIDDEN');
  await app.close();
  await handle.close();
  await rm(uploadDir, { recursive: true });
});
