import { expect, it } from 'vitest';
import { devAuth } from '@sw/auth';
import { PartyDetailSchema } from '@sw/contracts';
import { createDb, migrate, seed, userDirectory } from '@sw/persistence';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import { composeMasterData } from '../src/composition/master-data.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerMasterDataRoutes } from '../src/http/master-data/routes.js';
import { insertSample } from './helpers/kpi-sample.js';
import { loginAs } from './helpers/server.js';

const AT = '2026-10-12T00:00:00.000Z';
const WINDOW = { from: '2026-09-12', to: '2026-10-12' };
const SEEDED_WAREHOUSE = '0199f0a0-0000-7000-8000-000000000010';
const SECRET = '0123456789abcdef0123456789abcdef';

it('主体指标按供应商的近一个月计数，仓库是数出来的 0', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  await insertSample(handle.db);
  const api = composeMasterData({ db: handle.db, timeZone: 'Asia/Shanghai', clock: new FixedClock(AT) });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: SECRET }),
    register: (server) => registerMasterDataRoutes(server, api),
  });
  const cookie = await loginAs(app, 'manager');
  const supplier = await app.inject({ method: 'GET', url: '/api/v1/parties/supplier', headers: { cookie } });
  expect(supplier.statusCode).toBe(200);
  expect(PartyDetailSchema.safeParse(supplier.json()).success).toBe(true);
  expect(supplier.json().kpis.dueBatches).toMatchObject({ n: 9, numerator: 9 });
  expect(supplier.json().kpis.onTime).toMatchObject({ n: 8, numerator: 2, denominator: 8 });
  expect(supplier.json().kpiWindow).toEqual(WINDOW);
  await expectEmpty({ app, cookie, url: '/api/v1/parties/warehouse' });
  await expectEmpty({ app, cookie, url: `/api/v1/parties/${SEEDED_WAREHOUSE}` });
  const ignored = await app.inject({ method: 'GET', url: '/api/v1/parties/supplier?from=2026-01-01&to=2026-01-31', headers: { cookie } });
  expect(ignored.json().kpiWindow).toEqual(WINDOW);
  expect(ignored.json().kpis.dueBatches.n).toBe(9);
  await app.close();
  await handle.close();
});

async function expectEmpty(input: { readonly app: Awaited<ReturnType<typeof buildHttpApp>>; readonly cookie: string; readonly url: string }) {
  const response = await input.app.inject({ method: 'GET', url: input.url, headers: { cookie: input.cookie } });
  expect(response.statusCode).toBe(200);
  expect(response.json().kpis.dueBatches.n).toBe(0);
  expect(response.json().kpis.onTime.n).toBe(0);
  expect(response.json().kpiWindow).toEqual(WINDOW);
}
