import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { WorkItemDetailSchema } from '../../packages/contracts/src/plan-views.js';
import { entityId } from '../../packages/domain/src/values/ids.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import type { AppHandle } from '../../packages/persistence/src/client.js';
import { workItemEvents } from '../../packages/persistence/src/schema/work-items.js';
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

it('历史读模型给出操作人和当时负责人，不用当前负责人回填', async () => {
  const created = await plan.create({
    subjectType: 'standalone',
    kind: 'task',
    title: '写单',
    plannedStart: localDate('2026-11-09'),
    plannedEnd: localDate('2026-11-10'),
    ownerUserId: entityId('buyer-1'),
  }, BUYER);
  plan.clock.advance(1);
  await plan.changeStatus({ workItemId: created.workItemId, status: 'in_progress' }, BUYER);
  plan.clock.advance(1);
  await plan.update({
    workItemId: created.workItemId,
    expectedVersion: 1,
    ownerUserId: entityId('buyer-2'),
    plannedEnd: localDate('2026-11-12'),
  }, BUYER);
  plan.clock.advance(1);
  await plan.changeStatus({ workItemId: created.workItemId, status: 'blocked' }, BUYER);
  plan.clock.advance(1);
  await plan.update({ workItemId: created.workItemId, expectedVersion: 3, ownerUserId: null }, BUYER);
  await insertEvent({
    id: 'early-status',
    workItemId: created.workItemId,
    kind: 'status_changed',
    field: 'status',
    oldValue: '"planned"',
    newValue: '"in_progress"',
    actorUserId: 'missing-user',
    at: '2026-11-08T00:00:00.000Z',
  });
  await insertEvent({
    id: 'z-owner',
    workItemId: created.workItemId,
    kind: 'owner_changed',
    field: 'ownerUserId',
    oldValue: 'null',
    newValue: '1',
    actorUserId: 'buyer-1',
    at: '2026-11-10T00:00:00.000Z',
  });
  await insertEvent({
    id: 'z-status',
    workItemId: created.workItemId,
    kind: 'status_changed',
    field: 'status',
    oldValue: '"blocked"',
    newValue: '"in_progress"',
    actorUserId: 'buyer-1',
    at: '2026-11-10T00:00:01.000Z',
  });
  await handle.exec(`delete from users where id = 'buyer-2'`);

  const detail = WorkItemDetailSchema.parse(await plan.get({ workItemId: created.workItemId }, BUYER));
  expect(detail.item.ownerUserId).toBeNull();
  expect(detail.events.map((event) => event.id)).toEqual([
    'early-status',
    expect.any(String),
    expect.any(String),
    expect.any(String),
    expect.any(String),
    expect.any(String),
    expect.any(String),
    'z-owner',
    'z-status',
  ]);
  expect(detail.events.map(ownerLabel)).toEqual([
    '未知',
    '采购甲',
    '采购甲',
    '已删除',
    '未知',
    '已删除',
    '未分配',
    '未知',
    '未知',
  ]);
  expect(detail.events[0]?.actor).toEqual({ presence: 'deleted', userId: 'missing-user' });
  expect(detail.events[1]).toMatchObject({ actorUserId: 'buyer-1', kind: 'created', field: null, note: null });
  expect(detail.events[1]?.actor).toEqual({ presence: 'named', userId: 'buyer-1', name: '采购甲' });
  expect(detail.events[3]?.ownerChange).toEqual({
    before: { presence: 'named', userId: 'buyer-1', name: '采购甲' },
    after: { presence: 'deleted', userId: 'buyer-2' },
  });
  expect(detail.events[6]?.ownerChange).toEqual({
    before: { presence: 'deleted', userId: 'buyer-2' },
    after: { presence: 'unassigned' },
  });
  expect(detail.events[7]?.ownerAtEvent).toEqual({ presence: 'unrecorded' });
  const stored = await handle.db.select().from(workItemEvents);
  expect(stored).toHaveLength(9);
  expect(stored.every((row) => row.note === null)).toBe(true);
});

function ownerLabel(event: { readonly ownerAtEvent: { readonly presence: string; readonly name?: string } }): string {
  if (event.ownerAtEvent.presence === 'named') return event.ownerAtEvent.name ?? '';
  if (event.ownerAtEvent.presence === 'deleted') return '已删除';
  if (event.ownerAtEvent.presence === 'unassigned') return '未分配';
  return '未知';
}

async function insertEvent(input: {
  readonly id: string;
  readonly workItemId: string;
  readonly kind: string;
  readonly field: string;
  readonly oldValue: string;
  readonly newValue: string;
  readonly actorUserId: string;
  readonly at: string;
}): Promise<void> {
  await handle.exec(`insert into work_item_events (id, work_item_id, kind, field, old_value, new_value, actor_user_id, note, created_at) values ('${input.id}', '${input.workItemId}', '${input.kind}', '${input.field}', '${input.oldValue}'::jsonb, '${input.newValue}'::jsonb, '${input.actorUserId}', null, '${input.at}')`);
}
