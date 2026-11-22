import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { entityId } from '../../packages/domain/src/values/ids.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import type { AppHandle } from '../../packages/persistence/src/client.js';
import { workItemEvents, workItems } from '../../packages/persistence/src/schema/work-items.js';
import { BUYER, openPlanDb, resetPlanDb, seedPlanBase, wiring, type PlanWiring } from './support.js';

let handle: AppHandle;
let plan: PlanWiring;

beforeAll(async () => {
  handle = await openPlanDb();
}, 30000);

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await resetPlanDb(handle);
  await seedPlanBase(handle);
  plan = wiring(handle);
});

it('从批次三个日期生成里程碑，重复生成不重复建活动项', async () => {
  const first = await plan.generate({ orderLineIds: [entityId('line-1')] }, BUYER);
  expect(first).toEqual({ created: 5, skipped: 0 });

  const created = await handle.db.select().from(workItems);
  expect(created).toHaveLength(5);
  const confirmed = created.find((row) => row.id === 'work-item:batch:batch-1:date_buyer_confirmed');
  expect(confirmed).toMatchObject({
    subjectType: 'delivery_batch',
    subjectId: 'batch-1',
    kind: 'milestone',
    source: 'batch_milestone',
    ownerUserId: 'buyer-1',
    plannedStart: '2026-11-12',
    plannedEnd: '2026-11-12',
    status: 'planned',
    version: 0,
  });
  const events = await handle.db.select().from(workItemEvents);
  expect(events.filter((event) => event.kind === 'created')).toHaveLength(5);

  const second = await plan.generate({ batchIds: [entityId('batch-1')] }, BUYER);
  expect(second).toEqual({ created: 0, skipped: 3 });
  expect(await handle.db.select().from(workItems)).toHaveLength(5);
});

it('已有手工项的批次不再生成里程碑，手工项不覆盖', async () => {
  const manual = await plan.create({
    subjectType: 'delivery_batch',
    subjectId: entityId('batch-3'),
    kind: 'task',
    title: '人工排期',
    plannedStart: localDate('2026-11-20'),
    plannedEnd: localDate('2026-11-20'),
  }, BUYER);

  const result = await plan.generate({ batchIds: [entityId('batch-3')] }, BUYER);
  expect(result).toEqual({ created: 0, skipped: 1 });

  const rows = await handle.db.select().from(workItems);
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.id).toBe(manual.workItemId);
  expect(row).toMatchObject({ source: 'manual', title: '人工排期', kind: 'task' });
});

it('没有日期或没有输入的批次不生成，并拒绝空输入', async () => {
  await expect(plan.generate({}, BUYER)).rejects.toThrow(/批次或订单行/);
  const result = await plan.generate({ batchIds: [entityId('batch-2')] }, BUYER);
  expect(result).toEqual({ created: 1, skipped: 0 });
});
