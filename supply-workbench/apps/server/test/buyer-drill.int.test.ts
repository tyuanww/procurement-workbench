import { expect, it } from 'vitest';
import { devAuth } from '@sw/auth';
import { BuyerDrillSchema, BuyerLoadDashboardSchema } from '@sw/contracts';
import { createDb, migrate, seed, userDirectory } from '@sw/persistence';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import { composePerformance } from '../src/composition/performance.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerPerformanceRoutes } from '../src/http/performance/routes.js';
import { insertDrillSample } from './helpers/buyer-drill.js';
import { insertSample } from './helpers/kpi-sample.js';
import { loginAs } from './helpers/server.js';

const at = '2026-10-12T00:00:00.000Z';
const period = 'from=2026-10-01&to=2026-10-31';
const base = '/api/v1/dashboard/buyers';

it('采购负荷下钻与同线逾期批次和无归属异常计数一致', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    await seed(handle.exec);
    await insertSample(handle.db);
    await insertDrillSample(handle.db);
    const api = composePerformance({ db: handle.db, timeZone: 'Asia/Shanghai', clock: new FixedClock(at) });
    const app = await buildHttpApp({
      auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
      register: (server) => registerPerformanceRoutes(server, api),
    });
    try {
      const cookie = await loginAs(app, 'manager');
      const get = async (path: string) => {
        const response = await app.inject({ method: 'GET', url: path, headers: { cookie } });
        expect(response.statusCode).toBe(200);
        return response.json();
      };
      const finished = BuyerLoadDashboardSchema.parse(await get(`${base}?${period}&lane=finished`));
      const all = BuyerLoadDashboardSchema.parse(await get(`${base}?${period}`));
      const buyer = finished.rows.find((row) => row.buyer.id === 'buyer-1');
      expect(buyer).toMatchObject({ openBatches: 6, overdue: 2, dueToday: 1 });
      const drill = `${base}/drill?kind=overdue&buyerId=buyer-1`;
      const scoped = BuyerDrillSchema.parse(await get(`${drill}&lane=finished`));
      expect(scoped.items).toHaveLength(buyer?.overdue ?? -1);
      expect(scoped.items.map((row) => [row.id, row.orderLineId])).toEqual([['overdue', 'line-1'], ['first-set', 'line-1']]);
      expect(BuyerDrillSchema.parse(await get(drill)).items.map((item) => item.id)).toContain('material-late');
      expect(BuyerDrillSchema.parse(await get(`${base}/drill?kind=overdue&buyerId=buyer-2&lane=finished`)).items.map((item) => item.id)).toEqual(['other-buyer-late']);

      expect(finished.unassignedExceptions).toBeNull();
      expect(all.unassignedExceptions).toBe(2);
      const unassigned = BuyerDrillSchema.parse(await get(`${base}/drill?kind=unassigned-exceptions`));
      expect(unassigned.items).toHaveLength(all.unassignedExceptions ?? -1);
      expect(unassigned.items.map((item) => item.id)).toEqual(['unassigned-a', 'unassigned-b']);
      const buyerCookie = await loginAs(app, 'buyer');
      const denied = await app.inject({ method: 'GET', url: drill, headers: { cookie: buyerCookie } });
      expect(denied.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  } finally {
    await handle.close();
  }
}, 30_000);
