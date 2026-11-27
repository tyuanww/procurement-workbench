import { composePlan } from '../../apps/server/src/composition/plan.js';
import { composeProductDevelopment } from '../../apps/server/src/composition/product-development.js';
import { composeReporting } from '../../apps/server/src/composition/reporting.js';
import { buildHttpApp } from '../../apps/server/src/http/app.js';
import { registerPlanRoutes } from '../../apps/server/src/http/plan/routes.js';
import { registerProductDevelopmentRoutes } from '../../apps/server/src/http/product-development/routes.js';
import { registerReportingRoutes } from '../../apps/server/src/http/reporting/routes.js';
import { devAuth } from '../../packages/auth/src/index.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import { createDb, migrate, seed, userDirectory } from '../../packages/persistence/src/index.js';

export const product = '0199f0a0-0000-7000-8000-000000000004';
export const buyer = '0199f0a0-0000-7000-8000-000000000002';
export const otherBuyer = '0199f0a0-0000-7000-8000-000000000003';
export const manager = '0199f0a0-0000-7000-8000-000000000005';
export const root = '/api/v1/product-development';

export async function setup() {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const accessCode = 'cg09-test-code';
  const clock = { today: () => localDate('2026-11-19'), now: () => '2026-11-19T00:00:00.000Z' };
  const input = { db: handle.db, timeZone: 'Asia/Shanghai', clock };
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode, secret: 'test-secret-product-development-only' }),
    register(server) {
      registerPlanRoutes(server, composePlan(input));
      registerProductDevelopmentRoutes(server, composeProductDevelopment(input));
      registerReportingRoutes(server, composeReporting({ ...input, secret: 'test-secret-reporting-only' }));
    },
  });
  return {
    app,
    db: handle.db,
    exec: handle.exec,
    async login(userId: string) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId, accessCode } });
      const cookie = response.headers['set-cookie'];
      if (typeof cookie !== 'string') throw new Error('测试账号登录失败');
      return { cookie: cookie.split(';')[0] ?? '' };
    },
    async close() {
      await app.close();
      await handle.close();
    },
  };
}
