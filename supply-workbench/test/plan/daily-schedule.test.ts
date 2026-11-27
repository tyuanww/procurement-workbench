import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { entityId } from '../../packages/domain/src/values/ids.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import type { AppHandle } from '../../packages/persistence/src/client.js';
import { BUYER, TODAY, TOMORROW, YESTERDAY, openPlanDb, resetPlanDb, seedPlanBase, wiring, type PlanWiring } from './support.js';

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

it('每日计划只返回今天到期和逾期，排除明天、已完成和已取消', async () => {
  await task({ title: '今天到', end: TODAY, ownerUserId: entityId('buyer-1') });
  await task({ title: '已逾期', end: YESTERDAY, ownerUserId: entityId('buyer-2') });
  await task({ title: '明天到', end: TOMORROW, ownerUserId: entityId('buyer-1') });
  const done = await task({ title: '已完成', end: YESTERDAY, ownerUserId: entityId('buyer-1') });
  await plan.changeStatus({ workItemId: done.workItemId, status: 'in_progress' }, BUYER);
  await plan.changeStatus({ workItemId: done.workItemId, status: 'done' }, BUYER);
  const cancelled = await task({ title: '已取消', end: YESTERDAY, ownerUserId: entityId('buyer-1') });
  await plan.changeStatus({ workItemId: cancelled.workItemId, status: 'cancelled' }, BUYER);

  const daily = await plan.daily({ date: TODAY }, BUYER);

  expect(daily.total).toBe(2);
  expect(daily.overdueCount).toBe(1);
  expect(daily.items.map((item) => item.title)).toEqual(['已逾期', '今天到']);
  expect(daily.items.map((item) => item.overdueDays)).toEqual([1, null]);
  expect(daily.byOwner.map((group) => group.key)).toEqual(['buyer-2', 'buyer-1']);
  expect(daily.byOwner[0]?.label).toBe('采购乙');
});

it('每日计划按供应商和工厂过滤，生成项回退到订单行的供应商', async () => {
  await plan.generate({ batchIds: [entityId('batch-2')] }, BUYER);
  await task({ title: '供应商项', end: TODAY, counterpartyPartyId: entityId('party-supplier'), counterpartyRole: 'supplier' });
  await task({ title: '工厂项', end: TODAY, counterpartyPartyId: entityId('party-other'), counterpartyRole: 'factory' });

  const all = await plan.daily({ date: TODAY }, BUYER);
  expect(all.total).toBe(3);
  const generated = all.items.find((item) => item.source === 'batch_milestone');
  expect(generated?.supplierPartyId).toBe('party-supplier');
  expect(generated?.orderLine).toMatchObject({ poRaw: 'PO-1', nameRaw: '海葡萄' });
  expect(generated?.batch?.id).toBe('batch-2');

  const bySupplier = await plan.daily({ date: TODAY, supplierPartyId: 'party-supplier' }, BUYER);
  expect(bySupplier.items.map((item) => item.title).sort()).toEqual(['供应商项', '确认到货日 2026-11-09']);
  expect(bySupplier.bySupplier[0]?.key).toBe('party-supplier');

  const byFactory = await plan.daily({ date: TODAY, factoryPartyId: 'party-other' }, BUYER);
  expect(byFactory.items.map((item) => item.title)).toEqual(['工厂项']);
  const byOwner = await plan.daily({ date: TODAY, ownerUserId: 'buyer-1' }, BUYER);
  expect(byOwner.items.map((item) => item.source)).toEqual(['batch_milestone']);
});

it('总排期按周、按月返回相交项，空区间返回空', async () => {
  await task({ title: '本周', start: localDate('2026-11-05'), end: localDate('2026-11-07') });
  await task({ title: '下周', start: localDate('2026-11-10'), end: localDate('2026-11-12') });
  await task({ title: '月底', start: localDate('2026-11-25'), end: localDate('2026-11-26') });

  const week = await plan.schedule({ from: localDate('2026-11-02'), to: localDate('2026-11-08') }, BUYER);
  expect(week.total).toBe(1);
  expect(week.items[0]?.title).toBe('本周');

  const month = await plan.schedule({ from: localDate('2026-11-01'), to: localDate('2026-11-30') }, BUYER);
  expect(month.total).toBe(3);
  expect(month.items.map((item) => item.title)).toEqual(['本周', '下周', '月底']);

  const finished = await task({ title: '完成齐料', end: localDate('2026-11-12') });
  await plan.changeStatus({ workItemId: finished.workItemId, status: 'in_progress' }, BUYER);
  await plan.changeStatus({ workItemId: finished.workItemId, status: 'done' }, BUYER);
  const range = { from: localDate('2026-11-01'), to: localDate('2026-11-30') };
  expect((await plan.schedule(range, BUYER)).total).toBe(3);
  expect((await plan.schedule({ ...range, includeClosed: true }, BUYER)).items).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: finished.workItemId, status: 'done' }),
  ]));
  const empty = await plan.schedule({ from: localDate('2026-12-01'), to: localDate('2026-12-31') }, BUYER);
  expect(empty).toMatchObject({ total: 0, items: [] });
});

async function task(input: {
  readonly title: string;
  readonly start?: ReturnType<typeof localDate>;
  readonly end: ReturnType<typeof localDate>;
  readonly ownerUserId?: ReturnType<typeof entityId>;
  readonly counterpartyPartyId?: ReturnType<typeof entityId>;
  readonly counterpartyRole?: 'supplier' | 'factory';
}): Promise<{ readonly workItemId: ReturnType<typeof entityId> }> {
  return plan.create({
    subjectType: 'standalone',
    kind: 'task',
    title: input.title,
    plannedStart: input.start ?? input.end,
    plannedEnd: input.end,
    ...(input.ownerUserId === undefined ? {} : { ownerUserId: input.ownerUserId }),
    ...(input.counterpartyPartyId === undefined ? {} : { counterpartyPartyId: input.counterpartyPartyId }),
    ...(input.counterpartyRole === undefined ? {} : { counterpartyRole: input.counterpartyRole }),
  }, BUYER);
}
