import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { entityId } from '../../packages/domain/src/values/ids.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import type { AppHandle } from '../../packages/persistence/src/client.js';
import { workItemEvents } from '../../packages/persistence/src/schema/work-items.js';
import { auditLog } from '../../packages/persistence/src/schema/platform.js';
import { BUYER, TODAY, TOMORROW, openPlanDb, resetPlanDb, seedPlanBase, wiring, type PlanWiring } from './support.js';

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

it('状态变更追加事件，非法迁移被拒绝且不写事件', async () => {
  const created = await createTask('写单');
  const changed = await plan.changeStatus({ workItemId: created.workItemId, status: 'in_progress', note: '开工' }, BUYER);
  expect(changed.version).toBe(1);
  const events = await handle.db.select().from(workItemEvents);
  expect(events.map((event) => event.kind)).toEqual(['created', 'status_changed']);
  expect(events[1]).toMatchObject({ field: 'status', oldValue: 'planned', newValue: 'in_progress', note: '开工' });

  await expect(plan.changeStatus({ workItemId: created.workItemId, status: 'planned' }, BUYER)).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { state: 'in_progress->planned' } });
  await expect(plan.changeStatus({ workItemId: created.workItemId, status: 'done' }, BUYER)).resolves.toMatchObject({ version: 2 });
  await expect(plan.changeStatus({ workItemId: created.workItemId, status: 'planned' }, BUYER)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  expect((await handle.db.select().from(workItemEvents)).filter((event) => event.kind === 'status_changed')).toHaveLength(2);
});

it('负责人和日期变更各写一条事件，旧值保留', async () => {
  const created = await createTask('写单');
  const updated = await plan.update({
    workItemId: created.workItemId,
    expectedVersion: 0,
    ownerUserId: entityId('buyer-2'),
    plannedStart: localDate('2026-11-10'),
    plannedEnd: localDate('2026-11-11'),
  }, BUYER);
  expect(updated.version).toBe(1);
  const detail = await plan.get({ workItemId: created.workItemId }, BUYER);
  expect(detail.item).toMatchObject({ ownerUserId: 'buyer-2', ownerName: '采购乙', plannedStart: '2026-11-10', plannedEnd: '2026-11-11', version: 1 });
  const changeEvents = detail.events.filter((event) => event.kind !== 'created');
  expect(changeEvents.map((event) => [event.kind, event.field])).toEqual([
    ['owner_changed', 'ownerUserId'],
    ['date_changed', 'plannedStart'],
    ['date_changed', 'plannedEnd'],
  ]);
  expect(changeEvents[1]).toMatchObject({ oldValue: '2026-11-09', newValue: '2026-11-10' });

  await expect(plan.update({ workItemId: created.workItemId, expectedVersion: 0, title: '过期版本' }, BUYER)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  await expect(plan.update({ workItemId: created.workItemId, expectedVersion: 1, plannedStart: localDate('2026-11-20') }, BUYER)).rejects.toThrow(/开始日/);
});

it('依赖成环和自环被拒绝，重复依赖幂等', async () => {
  const a = await createTask('A');
  const b = await createTask('B');
  const c = await createTask('C');
  const first = await plan.addDependency({ fromItemId: a.workItemId, toItemId: b.workItemId }, BUYER);
  expect(first.created).toBe(true);
  const duplicate = await plan.addDependency({ fromItemId: a.workItemId, toItemId: b.workItemId }, BUYER);
  expect(duplicate).toEqual({ dependencyId: first.dependencyId, created: false });
  await plan.addDependency({ fromItemId: b.workItemId, toItemId: c.workItemId }, BUYER);

  await expect(plan.addDependency({ fromItemId: c.workItemId, toItemId: a.workItemId }, BUYER)).rejects.toThrow(/环/);
  await expect(plan.addDependency({ fromItemId: a.workItemId, toItemId: a.workItemId }, BUYER)).rejects.toThrow(/自己/);
  const dependencyEvents = (await handle.db.select().from(workItemEvents)).filter((event) => event.kind === 'dependency_changed');
  expect(dependencyEvents).toHaveLength(2);
  expect((await plan.get({ workItemId: b.workItemId }, BUYER)).dependenciesIn).toHaveLength(1);
  expect((await plan.get({ workItemId: a.workItemId }, BUYER)).dependenciesOut).toHaveLength(1);

  await expect(handle.exec(`insert into work_item_dependencies (id, from_item_id, to_item_id, kind, created_at) values ('bad-self', 'a', 'a', 'finish_to_start', '${TODAY}')`)).rejects.toThrow();
  await expect(handle.exec(`insert into work_item_dependencies (id, from_item_id, to_item_id, kind, created_at) values ('bad-dup', '${a.workItemId}', '${b.workItemId}', 'finish_to_start', '${TODAY}')`)).rejects.toThrow();
});

it('计划写留下 audit_log，事务写在同一工作单元', async () => {
  const created = await createTask('审计任务');
  await plan.changeStatus({ workItemId: created.workItemId, status: 'in_progress' }, BUYER);
  const entries = await handle.db.select().from(auditLog);
  const own = entries.filter((row) => row.entityId === created.workItemId).map((row) => row.action);
  expect(own).toEqual(['work_item.create', 'work_item.status']);
});

it('并发同版本更新只有一个成功，另一个拿到版本冲突', async () => {
  const created = await createTask('并发任务');
  const results = await Promise.allSettled([
    plan.update({ workItemId: created.workItemId, expectedVersion: 0, title: '甲' }, BUYER),
    plan.update({ workItemId: created.workItemId, expectedVersion: 0, title: '乙' }, BUYER),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect((await plan.get({ workItemId: created.workItemId }, BUYER)).item.version).toBe(1);
});

it('并发添加相反依赖时事务锁保证只有一个成环检查通过', async () => {
  const a = await createTask('并发 A');
  const b = await createTask('并发 B');
  const results = await Promise.allSettled([
    plan.addDependency({ fromItemId: a.workItemId, toItemId: b.workItemId }, BUYER),
    plan.addDependency({ fromItemId: b.workItemId, toItemId: a.workItemId }, BUYER),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
});

it('列表默认隐藏已完成和已取消，可按状态和 subject 过滤', async () => {
  const open = await createTask('进行中');
  const done = await createTask('已完成');
  const createDone = await createTask('被取消');
  await plan.changeStatus({ workItemId: done.workItemId, status: 'in_progress' }, BUYER);
  await plan.changeStatus({ workItemId: done.workItemId, status: 'done' }, BUYER);
  await plan.changeStatus({ workItemId: createDone.workItemId, status: 'cancelled' }, BUYER);

  const defaults = await plan.list({}, BUYER);
  expect(defaults.items.map((item) => item.title)).toEqual(['进行中']);
  expect(defaults.page.total).toBe(1);
  const closed = await plan.list({ includeClosed: true }, BUYER);
  expect(closed.page.total).toBe(3);
  const doneOnly = await plan.list({ status: ['done'], includeClosed: true }, BUYER);
  expect(doneOnly.items.map((item) => item.id)).toEqual([done.workItemId]);
  const standalone = await plan.list({ subjectType: 'standalone' }, BUYER);
  expect(standalone.page.total).toBe(1);
  expect(open.workItemId).toBe(defaults.items[0]?.id);
});

it('事件表在数据库层是只追加：update/delete 不生效', async () => {
  const created = await createTask('写单');
  const events = await handle.db.select().from(workItemEvents);
  const eventId = events[0]?.id;
  expect(eventId).toBeDefined();
  await handle.exec(`update work_item_events set note = '被改写' where id = '${String(eventId)}'`);
  await handle.exec(`delete from work_item_events where id = '${String(eventId)}'`);
  const after = await handle.db.select().from(workItemEvents);
  expect(after).toHaveLength(1);
  expect(after[0]?.note).toBeNull();
  expect(created.workItemId).toBe(events[0]?.workItemId);
});

async function createTask(title: string): Promise<{ readonly workItemId: ReturnType<typeof entityId> }> {
  return plan.create({
    subjectType: 'standalone',
    kind: 'task',
    title,
    plannedStart: TODAY,
    plannedEnd: TOMORROW,
    ownerUserId: entityId('buyer-1'),
  }, BUYER);
}
