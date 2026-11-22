import { expect, it } from 'vitest';
import { composePlan } from '../../apps/server/src/composition/plan.js';
import { buildHttpApp } from '../../apps/server/src/http/app.js';
import { registerPlanRoutes } from '../../apps/server/src/http/plan/routes.js';
import { loginAs } from '../../apps/server/test/helpers/server.js';
import { devAuth } from '../../packages/auth/src/index.js';
import { ProjectProgressSchema } from '../../packages/contracts/src/index.js';
import { entityId, localDate } from '../../packages/domain/src/index.js';
import { seed, userDirectory } from '../../packages/persistence/src/index.js';
import { BUYER, openPlanDb, seedPlanBase, TODAY, TOMORROW, wiring, YESTERDAY } from './support.js';

it('项目进度汇总、到期状态和各维度使用同一周期内的任务，明细只在请求时返回', async () => {
  const db = await openPlanDb();
  try {
    await seedPlanBase(db);
    await seed(db.exec);
    const plan = wiring(db);
    const late = await plan.create({
      subjectType: 'delivery_batch', subjectId: entityId('batch-2'), kind: 'task', title: '原料到厂',
      ownerUserId: BUYER.id, counterpartyPartyId: entityId('party-other'), counterpartyRole: 'factory',
      plannedStart: localDate('2026-11-03'), plannedEnd: YESTERDAY,
    }, BUYER);
    const active = { subjectType: 'standalone', kind: 'task', plannedStart: YESTERDAY, ownerUserId: entityId('buyer-2') } as const;
    const blocked = await plan.create({ ...active, title: '待样品回复', plannedEnd: TOMORROW, counterpartyPartyId: entityId('party-supplier'), counterpartyRole: 'supplier' }, BUYER);
    await plan.changeStatus({ ...blocked, status: 'in_progress' }, BUYER);
    await plan.changeStatus({ ...blocked, status: 'blocked' }, BUYER);
    const done = await plan.create({ ...active, title: '已完成验样', plannedEnd: YESTERDAY }, BUYER);
    await plan.changeStatus({ ...done, status: 'in_progress' }, BUYER);
    await plan.changeStatus({ ...done, status: 'done' }, BUYER);
    const cancelled = await plan.create({ ...active, title: '已取消返工', plannedEnd: YESTERDAY }, BUYER);
    await plan.changeStatus({ ...cancelled, status: 'cancelled' }, BUYER);
    const dueToday = await plan.create({ ...active, title: '今日待交', plannedEnd: TODAY }, BUYER);
    await plan.create({ ...active, title: '上月历史', plannedStart: localDate('2026-10-01'), plannedEnd: localDate('2026-10-30') }, BUYER);

    const app = await buildHttpApp({
      auth: devAuth({ directory: userDirectory(db.db), accessCode: 'dev-code', secret: 'test-secret-project-progress-only' }),
      register: (server) => registerPlanRoutes(server, composePlan({ db: db.db, timeZone: 'Asia/Shanghai', clock: plan.clock })),
    });
    try {
      const range = '/api/v1/plan/progress?from=2026-11-05&to=2026-11-15';
      expect((await app.inject({ url: range + '&includeItems=true' })).statusCode).toBe(401);
      const cookie = await loginAs(app, 'manager');
      const headers = { cookie };
      const summaryResponse = await app.inject({ url: range, headers });
      expect(summaryResponse.statusCode).toBe(200);
      const summary = ProjectProgressSchema.parse(summaryResponse.json());
      expect(summary).toMatchObject({ total: 5, done: 1, overdue: 1, blocked: 1 });
      expect(summary.details).toBeUndefined();
      expect(summary.byOwner[0]?.itemIds).toBeUndefined();

      const response = await app.inject({ url: range + '&includeItems=true', headers });
      expect(response.statusCode).toBe(200);
      const details = ProjectProgressSchema.parse(response.json());
      expect(details).toMatchObject({ from: '2026-11-05', to: '2026-11-15', total: 5, done: 1, overdue: 1, blocked: 1 });
      expect(details.details?.asOf).toBe(TODAY);
      expect(details.details?.tasks.map(({ item }) => item.id)).toEqual(expect.arrayContaining([
        late.workItemId, blocked.workItemId, done.workItemId, cancelled.workItemId, dueToday.workItemId,
      ]));
      expect(details.details?.tasks.filter((task) => task.overdue)).toMatchObject([
        { item: { id: late.workItemId, plannedEnd: YESTERDAY, orderLine: { poRaw: 'PO-1' }, batch: { seq: 2 } } },
      ]);
      expect(details.byOwner).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: BUYER.id, total: 1, overdue: 1, itemIds: [late.workItemId] }),
      ]));
      expect(details.bySupplier).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'party-supplier', total: 2, overdue: 1, blocked: 1, itemIds: [late.workItemId, blocked.workItemId] }),
      ]));
      expect(details.byFactory).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'party-other', total: 1, itemIds: [late.workItemId] }),
      ]));
      expect((await app.inject({ url: range + '&includeItems=other', headers })).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  } finally {
    await db.close();
  }
});
