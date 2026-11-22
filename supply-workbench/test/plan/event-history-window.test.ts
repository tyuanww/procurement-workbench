import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { WorkItemDetailSchema } from '../../packages/contracts/src/plan-views.js';
import { entityId } from '../../packages/domain/src/values/ids.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import type { AppHandle } from '../../packages/persistence/src/client.js';
import { workItemEvents } from '../../packages/persistence/src/schema/work-items.js';
import { BUYER, openPlanDb, resetPlanDb, seedPlanBase, wiring, type PlanWiring } from './support.js';

const AT = '2026-11-09T00:00:00.000Z';

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

it('第 49 和 50 条仍是前缀里的负责人，第 51 条改人不会倒填', async () => {
  await insertItem('window-prefix', 'buyer-2');
  const rows = [createdRow({ workItemId: 'window-prefix', id: 'p01', second: 1 })];
  for (let index = 2; index <= 50; index += 1) rows.push(statusRow({ workItemId: 'window-prefix', id: pad('p', index), second: index }));
  rows.push(ownerRow({ workItemId: 'window-prefix', id: 'p51', second: 51, before: 'buyer-1', after: 'buyer-2' }));
  await insertEvents(rows);

  const detail = WorkItemDetailSchema.parse(await plan.get({ workItemId: entityId('window-prefix') }, BUYER));
  expect(detail.item.ownerUserId).toBe('buyer-2');
  expect(detail.events).toHaveLength(50);
  expect(detail.events.map((event) => event.id)).toEqual(rows.slice(0, 50).map((row) => row.id));
  const first = detail.events[0];
  const event49 = detail.events[48];
  const event50 = detail.events[49];
  if (first === undefined || event49 === undefined || event50 === undefined) throw new Error('窗口事件不够');
  expect(ownerLabel(first)).toBe('采购甲');
  expect(ownerLabel(event49)).toBe('采购甲');
  expect(ownerLabel(event50)).toBe('采购甲');
  expect(detail.events.some((event) => event.id === 'p51')).toBe(false);
});

it('第 50 和 51 条同一时刻时，被截断的那条不沿用负责人', async () => {
  await insertItem('window-tie', 'buyer-2');
  const rows = [createdRow({ workItemId: 'window-tie', id: 't01', second: 1 })];
  for (let index = 2; index <= 49; index += 1) rows.push(statusRow({ workItemId: 'window-tie', id: pad('t', index), second: index }));
  rows.push(statusRow({ workItemId: 'window-tie', id: 't50', second: 100 }));
  rows.push(ownerRow({ workItemId: 'window-tie', id: 't51', second: 100, before: 'buyer-1', after: 'buyer-2' }));
  await insertEvents(rows);

  const detail = WorkItemDetailSchema.parse(await plan.get({ workItemId: entityId('window-tie') }, BUYER));
  expect(detail.events).toHaveLength(50);
  const event49 = detail.events.at(-2);
  const event50 = detail.events.at(-1);
  if (event49 === undefined || event50 === undefined) throw new Error('窗口事件不够');
  expect(event49.id).toBe('t49');
  expect(ownerLabel(event49)).toBe('采购甲');
  expect(event50.id).toBe('t50');
  expect(ownerLabel(event50)).toBe('未知');
  expect(detail.item.ownerUserId).toBe('buyer-2');
});

it('同一时刻被截断的负责人变更本身也不当成已知', async () => {
  await insertItem('window-cut', 'buyer-2');
  const rows = [createdRow({ workItemId: 'window-cut', id: 'c01', second: 1 })];
  for (let index = 2; index <= 49; index += 1) rows.push(statusRow({ workItemId: 'window-cut', id: pad('c', index), second: index }));
  rows.push(ownerRow({ workItemId: 'window-cut', id: 'a-owner', second: 100, before: 'buyer-1', after: 'buyer-2' }));
  rows.push(ownerRow({ workItemId: 'window-cut', id: 'z-owner', second: 100, before: 'buyer-2', after: 'buyer-1' }));
  await insertEvents(rows);
  const detail = WorkItemDetailSchema.parse(await plan.get({ workItemId: entityId('window-cut') }, BUYER));
  const kept = detail.events.at(-1);
  const earlier = detail.events.at(-2);
  if (kept === undefined || earlier === undefined) throw new Error('窗口事件不够');
  expect(detail.events).toHaveLength(50);
  expect(earlier.id).toBe('c49');
  expect(ownerLabel(earlier)).toBe('采购甲');
  expect(kept.id).toBe('a-owner');
  expect(ownerLabel(kept)).toBe('未知');
  expect(kept.ownerChange).toEqual({ before: { presence: 'unrecorded' }, after: { presence: 'unrecorded' } });
  expect(kept.actor).toEqual({ presence: 'named', userId: 'buyer-1', name: '采购甲' });
});

it('微秒不同的事件保持先后，不被收成同一毫秒', async () => {
  await insertItem('window-us', 'buyer-2');
  const rows = [createdRow({ workItemId: 'window-us', id: 'm01', second: 1 })];
  for (let index = 2; index <= 48; index += 1) rows.push(statusRow({ workItemId: 'window-us', id: pad('m', index), second: index }));
  rows.push({ ...statusRow({ workItemId: 'window-us', id: 'm49', second: 49 }), at: '2026-11-09T00:01:00.100100Z' });
  rows.push({ ...ownerRow({ workItemId: 'window-us', id: 'm50', second: 50, before: 'buyer-1', after: 'buyer-2' }), at: '2026-11-09T00:01:00.100200Z' });
  rows.push({ ...statusRow({ workItemId: 'window-us', id: 'm51', second: 51 }), at: '2026-11-09T00:01:00.100900Z' });
  await insertEvents(rows);
  const detail = WorkItemDetailSchema.parse(await plan.get({ workItemId: entityId('window-us') }, BUYER));
  const event49 = detail.events.find((event) => event.id === 'm49');
  const event50 = detail.events.find((event) => event.id === 'm50');
  if (event49 === undefined || event50 === undefined) throw new Error('窗口事件不够');
  expect(detail.events.some((event) => event.id === 'm51')).toBe(false);
  expect(ownerLabel(event49)).toBe('采购甲');
  expect(ownerLabel(event50)).toBe('采购乙');
});

it('应用清空负责人是未分配，SQL NULL 缺字段是未知', async () => {
  const created = await plan.create({
    subjectType: 'standalone',
    kind: 'task',
    title: '空值边界',
    plannedStart: localDate('2026-11-09'),
    plannedEnd: localDate('2026-11-10'),
    ownerUserId: entityId('buyer-1'),
  }, BUYER);
  plan.clock.advance(1);
  await plan.update({ workItemId: created.workItemId, expectedVersion: 0, ownerUserId: null }, BUYER);
  await handle.exec(`insert into work_item_events (id, work_item_id, kind, field, old_value, new_value, actor_user_id, note, created_at) values ('missing-owner', '${created.workItemId}', 'owner_changed', 'ownerUserId', null, null, 'buyer-1', null, '2026-11-09T03:00:00.000Z')`);
  const view = await plan.get({ workItemId: created.workItemId }, BUYER);
  const detail = WorkItemDetailSchema.parse(JSON.parse(JSON.stringify(view)));
  const cleared = detail.events.find((event) => event.kind === 'owner_changed' && event.id !== 'missing-owner');
  const missing = detail.events.find((event) => event.id === 'missing-owner');
  if (cleared === undefined || missing === undefined) throw new Error('缺空值事件');
  expect(ownerLabel(cleared)).toBe('未分配');
  expect(ownerLabel(missing)).toBe('未知');
  expect(missing).toMatchObject({ oldValue: null, newValue: null });
  expect(missing.ownerChange).toEqual({ before: { presence: 'unrecorded' }, after: { presence: 'unrecorded' } });
});

it('没有创建快照时，不拿当前负责人填历史', async () => {
  await insertItem('window-nosnap', 'buyer-1');
  await insertEvents([1, 2, 3].map((index) => statusRow({ workItemId: 'window-nosnap', id: `n0${index}`, second: index })));
  const detail = WorkItemDetailSchema.parse(await plan.get({ workItemId: entityId('window-nosnap') }, BUYER));
  expect(detail.item.ownerName).toBe('采购甲');
  expect(detail.events.map(ownerLabel)).toEqual(['未知', '未知', '未知']);
});

it('直接改任务负责人列不会改写已有历史', async () => {
  await insertItem('window-silent', 'buyer-1');
  await insertEvents([
    createdRow({ workItemId: 'window-silent', id: 's01', second: 1 }),
    statusRow({ workItemId: 'window-silent', id: 's02', second: 2 }),
  ]);
  await handle.exec(`update work_items set owner_user_id = 'buyer-2' where id = 'window-silent'`);
  const detail = WorkItemDetailSchema.parse(await plan.get({ workItemId: entityId('window-silent') }, BUYER));
  expect(detail.item.ownerUserId).toBe('buyer-2');
  expect(detail.events.map(ownerLabel)).toEqual(['采购甲', '采购甲']);
});

it('生成里程碑时创建快照写下当时的负责人', async () => {
  await plan.generate({ batchIds: [entityId('batch-1')] }, BUYER);
  const created = (await handle.db.select().from(workItemEvents)).filter((event) => event.kind === 'created');
  expect(created.length).toBeGreaterThan(0);
  expect(created.every((event) => isOwnerSnapshot(event.newValue, 'buyer-1'))).toBe(true);
  expect(created.some((event) => event.kind === 'owner_changed')).toBe(false);
});

function createdRow(input: { readonly workItemId: string; readonly id: string; readonly second: number }): EventRow {
  return { id: input.id, workItemId: input.workItemId, kind: 'created', field: null, oldValue: null, newValue: { ownerUserId: 'buyer-1' }, actorUserId: 'buyer-1', at: stamp(input.second) };
}

function statusRow(input: { readonly workItemId: string; readonly id: string; readonly second: number }): EventRow {
  return { id: input.id, workItemId: input.workItemId, kind: 'status_changed', field: 'status', oldValue: 'planned', newValue: 'in_progress', actorUserId: 'buyer-1', at: stamp(input.second) };
}

function ownerRow(input: { readonly workItemId: string; readonly id: string; readonly second: number; readonly before: string; readonly after: string }): EventRow {
  return { id: input.id, workItemId: input.workItemId, kind: 'owner_changed', field: 'ownerUserId', oldValue: input.before, newValue: input.after, actorUserId: 'buyer-1', at: stamp(input.second) };
}

async function insertItem(id: string, ownerUserId: string): Promise<void> {
  await handle.exec(`insert into work_items (id, created_at, updated_at, subject_type, subject_id, kind, title, owner_user_id, counterparty_party_id, counterparty_role, planned_start, planned_end, status, priority, source, parent_id, version) values ('${id}', '${AT}', '${AT}', 'standalone', null, 'task', '窗口', '${ownerUserId}', null, null, '2026-11-09', '2026-11-10', 'planned', 'normal', 'manual', null, 0)`);
}

async function insertEvents(rows: readonly EventRow[]): Promise<void> {
  const values = rows.map((row) => `('${row.id}', '${row.workItemId}', '${row.kind}', ${sqlText(row.field)}, ${sqlJson(row.oldValue)}, ${sqlJson(row.newValue)}, '${row.actorUserId}', null, '${row.at}')`).join(', ');
  await handle.exec(`insert into work_item_events (id, work_item_id, kind, field, old_value, new_value, actor_user_id, note, created_at) values ${values}`);
}

function stamp(second: number): string {
  return new Date(Date.UTC(2026, 10, 1, 0, 0, second)).toISOString();
}

function pad(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(2, '0')}`;
}

function sqlText(value: string | null): string {
  return value === null ? 'null' : `'${value}'`;
}

function sqlJson(value: unknown): string {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function ownerLabel(event: { readonly ownerAtEvent: { readonly presence: string; readonly name?: string } }): string {
  if (event.ownerAtEvent.presence === 'named') return event.ownerAtEvent.name ?? '';
  if (event.ownerAtEvent.presence === 'unassigned') return '未分配';
  if (event.ownerAtEvent.presence === 'deleted') return '已删除';
  return '未知';
}

function isOwnerSnapshot(value: unknown, ownerUserId: string): boolean {
  return typeof value === 'object' && value !== null && 'ownerUserId' in value && value.ownerUserId === ownerUserId;
}

type EventRow = {
  readonly id: string;
  readonly workItemId: string;
  readonly kind: string;
  readonly field: string | null;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly actorUserId: string;
  readonly at: string;
};
