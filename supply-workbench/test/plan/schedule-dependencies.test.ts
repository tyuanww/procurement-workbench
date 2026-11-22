import { expect, it } from 'vitest';
import { composePlan } from '../../apps/server/src/composition/plan.js';
import { buildHttpApp } from '../../apps/server/src/http/app.js';
import { registerPlanRoutes } from '../../apps/server/src/http/plan/routes.js';
import { ScheduleViewSchema, WorkItemDetailSchema } from '../../packages/contracts/src/plan-views.js';
import { entityId, procurementStageId } from '../../packages/domain/src/index.js';
import type { AppHandle } from '../../packages/persistence/src/client.js';
import { workItems } from '../../packages/persistence/src/schema/work-items.js';
import { AT, BUYER, TODAY, TOMORROW, YESTERDAY, openPlanDb, seedPlanBase, wiring } from './support.js';

const materialsId = procurementStageId('line-1', 'materials');
const productionId = procurementStageId('line-1', 'production');
const scheduleUrl = `/api/v1/plan/schedule?from=${TODAY}&to=${TOMORROW}`;
const manager = { id: entityId('manager'), name: '管理甲', roles: ['manager'] as const };

it('总排期和任务详情可查看窗口外的前置阻塞，后置状态和日期保持实际记录', async () => {
  const handle = await openPlanDb();
  try {
    await seedPlanBase(handle);
    await seedProcurementStages(handle);
    const plan = wiring(handle);
    const manual = await plan.create({
      subjectType: 'order_line', subjectId: entityId('line-1'), kind: 'task',
      title: '生产', plannedStart: TODAY, plannedEnd: TOMORROW,
    }, BUYER);
    const { dependencyId } = await plan.addDependency({ fromItemId: materialsId, toItemId: productionId }, BUYER);
    await plan.addDependency({ fromItemId: materialsId, toItemId: manual.workItemId }, BUYER);
    await plan.changeStatus({ workItemId: materialsId, status: 'in_progress' }, BUYER);
    await plan.changeStatus({ workItemId: materialsId, status: 'blocked' }, BUYER);
    await plan.changeStatus({ workItemId: productionId, status: 'in_progress' }, BUYER);

    const api = composePlan({ db: handle.db, clock: plan.clock, timeZone: 'Asia/Shanghai' });
    const app = await buildHttpApp({
      auth: { mode: 'dev', registerRoutes: () => undefined, resolve: async () => manager },
      register: (server) => registerPlanRoutes(server, api),
    });
    try {
      const scheduleResponse = await app.inject({ method: 'GET', url: scheduleUrl });
      expect(scheduleResponse.statusCode).toBe(200);
      const schedule = ScheduleViewSchema.parse(scheduleResponse.json());
      expect(schedule.items.map((item) => item.id).sort()).toEqual([manual.workItemId, productionId].sort());
      expect(schedule.items.find((item) => item.id === productionId)).toMatchObject({
        status: 'in_progress', plannedStart: TODAY, plannedEnd: TOMORROW,
      });
      const predecessor = { id: materialsId, title: '齐料', plannedEnd: YESTERDAY, status: 'blocked' };
      expect(schedule.dependencyConflicts).toEqual({ [productionId]: [predecessor] });

      const detailResponse = await app.inject({ method: 'GET', url: `/api/v1/plan/work-items/${encodeURIComponent(productionId)}` });
      expect(detailResponse.statusCode).toBe(200);
      const detail = WorkItemDetailSchema.parse(detailResponse.json());
      expect(detail.item).toMatchObject({ id: productionId, status: 'in_progress', plannedStart: TODAY });
      expect(detail.dependenciesIn).toMatchObject([{ id: dependencyId, fromItemId: materialsId, toItemId: productionId, kind: 'finish_to_start', predecessor }]);

      await plan.changeStatus({ workItemId: materialsId, status: 'in_progress' }, BUYER);
      await plan.changeStatus({ workItemId: materialsId, status: 'done' }, BUYER);
      const cleared = await app.inject({ method: 'GET', url: scheduleUrl });
      expect(cleared.statusCode).toBe(200);
      expect(ScheduleViewSchema.parse(cleared.json()).dependencyConflicts).toEqual({});
    } finally {
      await app.close();
    }
  } finally {
    await handle.close();
  }
}, 30_000);

async function seedProcurementStages(handle: AppHandle): Promise<void> {
  const base = {
    createdAt: AT, updatedAt: AT, subjectType: 'order_line', subjectId: 'line-1',
    ownerUserId: BUYER.id, status: 'planned', priority: 'normal', source: 'manual',
  };
  await handle.db.insert(workItems).values([
    { ...base, id: materialsId, title: '齐料', kind: 'milestone', plannedStart: YESTERDAY, plannedEnd: YESTERDAY },
    { ...base, id: productionId, title: '生产', kind: 'task', plannedStart: TODAY, plannedEnd: TOMORROW },
  ]);
}
