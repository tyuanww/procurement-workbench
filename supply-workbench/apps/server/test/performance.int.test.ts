import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { devAuth } from '@sw/auth';
import { StuckDashboardSchema } from '@sw/contracts';
import { createDb, migrate, schema, seed, userDirectory, type AppDatabase } from '@sw/persistence';
import { composePerformance } from '../src/composition/performance.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerPerformanceRoutes } from '../src/http/performance/routes.js';
import { insertSample } from './helpers/kpi-sample.js';
import { loginAs } from './helpers/server.js';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import type { FastifyInstance } from 'fastify';

const at = '2026-10-12T00:00:00.000Z';
const from = '2026-10-01';
const to = '2026-10-31';
const query = `from=${from}&to=${to}`;

it('D04 手算样例写进库后，三个看板接口与期望一致', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-perf-'));
  await insertSample(handle.db);
  const app = await performanceApp(handle.db);
  const cookie = await loginAs(app, 'manager');
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

it('卡点通过真实接口筛选全部 201 批，并能翻到最后一页', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    await seed(handle.exec);
    await insertSample(handle.db);
    const older = Array.from({ length: 194 }, (_, index) => ({
      id: `older-${String(index).padStart(3, '0')}`,
      status: 'confirmed',
      statusChangedAt: '2026-09-01T00:00:00.000Z',
      dateBuyerConfirmed: '2026-10-20',
    }));
    const pending = { id: 'zz-latest-pending', status: 'awaiting_date', statusChangedAt: at, dateBuyerConfirmed: null };
    await handle.db.insert(schema.deliveryBatches).values([...older, pending].map((batch, index) => ({
      ...batch, createdAt: at, updatedAt: at, orderLineId: 'line-1', seq: index + 10,
      plannedQty: '1', receiverPartyId: 'warehouse', origin: 'manual',
    })));
    const app = await performanceApp(handle.db);
    try {
      const cookie = await loginAs(app, 'manager');
      const getStuck = (filters: string) => readStuck(app, { cookie, filters });
      const first = await getStuck('&lane=finished');
      const last = await getStuck('&lane=finished&page=5');
      expect(first).toMatchObject({ asOf: '2026-10-12', page: 1, pageSize: 50, total: 201 });
      expect(first.items).toHaveLength(50);
      expect(first.items[0]?.batchId).toBe('older-000');
      expect(last.items.map((item) => item.batchId)).toEqual(['zz-latest-pending']);
      expect(last).toMatchObject({ page: 5, total: 201 });
      const middle = await Promise.all([2, 3, 4].map((page) => getStuck(`&lane=finished&page=${page}`)));
      expect(new Set([first, ...middle, last].flatMap((page) => page.items.map((item) => item.batchId))).size).toBe(201);
      expect((await getStuck('&lane=finished&page=900')).page).toBe(5);

      const drill = await getStuck('&lane=finished&stage=awaiting_date&bucket=0-3&cause=missing_date');
      expect(drill).toMatchObject({
        total: 1,
        kpis: { openBatches: 201, awaitingDate: 1 },
        causeCounts: { missing_date: 1 },
      });
      expect(drill.items.map((item) => item.batchId)).toEqual(['zz-latest-pending']);
      expect(drill.distribution).toEqual(first.distribution);

      const overdue = await getStuck('&lane=finished&card=overdue');
      expect(overdue.total).toBe(first.kpis.overdue);
      expect(overdue.items.map((item) => item.batchId)).toEqual(['overdue', 'first-set']);
      expect((await getStuck('&lane=material&card=overdue')).total).toBe(0);

      const invalid = await app.inject({ method: 'GET', url: `/api/v1/dashboard/stuck?${query}&page=0`, headers: { cookie } });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  } finally {
    await handle.close();
  }
});

async function readStuck(app: FastifyInstance, { cookie, filters }: { readonly cookie: string; readonly filters: string }) {
  const response = await app.inject({ method: 'GET', url: `/api/v1/dashboard/stuck?${query}${filters}`, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return StuckDashboardSchema.parse(response.json());
}

function performanceApp(db: AppDatabase) {
  const api = composePerformance({ db, timeZone: 'Asia/Shanghai', clock: new FixedClock(at) });
  return buildHttpApp({
    auth: devAuth({ directory: userDirectory(db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => registerPerformanceRoutes(server, api),
  });
}
