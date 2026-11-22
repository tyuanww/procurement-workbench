import { expect, it } from 'vitest';
import { attributeWorkItemEvents, eventUserIds, type AttributableWorkItemEvent } from '../../packages/application/src/shared/work-item-event-attribution.js';
import { workItemSnapshot } from '../../packages/application/src/plan/policies/events.js';
import { WorkItemEventViewSchema } from '../../packages/contracts/src/plan-views.js';
import type { WorkItem } from '../../packages/domain/src/entities/work-items.js';
import { entityId } from '../../packages/domain/src/values/ids.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';

const AT = '2026-11-09T00:00:00.000Z';
const NAMES = new Map([
  ['buyer-1', '采购甲'],
  ['buyer-2', '采购乙'],
  ['blank', ''],
]);

it('多次改负责人后，早先事件仍显示当时的负责人', () => {
  const views = attributeWorkItemEvents({
    events: [
      event({ id: 'b', kind: 'dependency_changed', createdAt: '2026-11-09T05:00:00.000Z', field: 'dependency' }),
      event({ id: 'n', kind: 'owner_changed', createdAt: '2026-11-09T04:00:00.000Z', field: 'ownerUserId', oldValue: 'buyer-2', newValue: null }),
      event({ id: 'd', kind: 'date_changed', createdAt: '2026-11-09T03:00:00.000Z', field: 'plannedEnd', oldValue: '2026-11-10', newValue: '2026-11-12' }),
      event({ id: 'o', kind: 'owner_changed', createdAt: '2026-11-09T02:00:00.000Z', field: 'ownerUserId', oldValue: 'buyer-1', newValue: 'buyer-2' }),
      event({ id: 's', kind: 'status_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'status', oldValue: 'planned', newValue: 'in_progress' }),
      event({ id: 'c', kind: 'created', newValue: workItemSnapshot(task(entityId('buyer-1'))) }),
    ],
    names: NAMES,
  });
  expect(views.map((view) => view.id)).toEqual(['c', 's', 'o', 'd', 'n', 'b']);
  expect(views.map(ownerLabel)).toEqual(['采购甲', '采购甲', '采购乙', '采购乙', '未分配', '未分配']);
  expect(views[2]?.ownerChange).toEqual({
    before: { presence: 'named', userId: 'buyer-1', name: '采购甲' },
    after: { presence: 'named', userId: 'buyer-2', name: '采购乙' },
  });
  expect(views[0]?.actor).toEqual({ presence: 'named', userId: 'buyer-1', name: '采购甲' });
  expect(views[1]?.ownerChange).toBeNull();
});

it('没有负责人快照，或变更值读不出来，就标未知', () => {
  const views = attributeWorkItemEvents({
    events: [
      event({ id: 'c', kind: 'created', newValue: { title: '写单' } }),
      event({ id: 's', kind: 'status_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'status', oldValue: 'planned', newValue: 'in_progress' }),
      event({ id: 'o', kind: 'owner_changed', createdAt: '2026-11-09T02:00:00.000Z', field: 'ownerUserId', oldValue: null, newValue: 'buyer-1' }),
      event({ id: 'd', kind: 'date_changed', createdAt: '2026-11-09T03:00:00.000Z', field: 'plannedEnd' }),
      event({ id: 'x', kind: 'owner_changed', createdAt: '2026-11-09T04:00:00.000Z', field: 'ownerUserId', oldValue: 'buyer-1', newValue: 1 }),
      event({ id: 't', kind: 'status_changed', createdAt: '2026-11-09T05:00:00.000Z', field: 'status', oldValue: 'in_progress', newValue: 'blocked' }),
    ],
    names: NAMES,
  });
  expect(views.map(ownerLabel)).toEqual(['未知', '未知', '采购甲', '采购甲', '未知', '未知']);
  expect(views[4]?.ownerChange).toEqual({
    before: { presence: 'named', userId: 'buyer-1', name: '采购甲' },
    after: { presence: 'unrecorded' },
  });
});

it('创建时负责人为空是未分配，和未知不是一回事', () => {
  const views = attributeWorkItemEvents({
    events: [
      event({ id: 'c', kind: 'created', newValue: workItemSnapshot(task(null)) }),
      event({ id: 's', kind: 'status_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'status', oldValue: 'planned', newValue: 'in_progress' }),
    ],
    names: NAMES,
  });
  expect(views.map(ownerLabel)).toEqual(['未分配', '未分配']);
});

it('同一时刻不按 id 猜测负责人，下一时刻才沿用读得懂的结果', () => {
  const created = event({ id: 'c', kind: 'created', createdAt: '2026-11-09T00:00:00.000Z', newValue: workItemSnapshot(task(entityId('buyer-1'))) });
  const later = event({ id: 'd', kind: 'status_changed', createdAt: '2026-11-09T02:00:00.000Z', field: 'status', oldValue: 'in_progress', newValue: 'blocked' });
  const statusBeforeId = event({ id: 'a', kind: 'status_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'status', oldValue: 'planned', newValue: 'in_progress' });
  const ownerAfterId = event({ id: 'b', kind: 'owner_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'ownerUserId', oldValue: 'buyer-1', newValue: 'buyer-2' });
  const statusAfterId = event({ id: 'z', kind: 'status_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'status', oldValue: 'planned', newValue: 'in_progress' });
  const ownerBeforeId = event({ id: 'm', kind: 'owner_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'ownerUserId', oldValue: 'buyer-1', newValue: 'buyer-2' });
  expect(labels(attributeWorkItemEvents({ events: [statusBeforeId, ownerAfterId, created, later], names: NAMES }))).toEqual([
    ['c', '采购甲'],
    ['a', '未知'],
    ['b', '采购乙'],
    ['d', '采购乙'],
  ]);
  expect(labels(attributeWorkItemEvents({ events: [created, ownerBeforeId, statusAfterId, later], names: NAMES }))).toEqual([
    ['c', '采购甲'],
    ['m', '采购乙'],
    ['z', '未知'],
    ['d', '采购乙'],
  ]);
});

it('同一毫秒里创建后又改负责人，之后的事件用变更后的负责人', () => {
  const views = attributeWorkItemEvents({
    events: [
      event({ id: 'c', kind: 'created', createdAt: '2026-11-09T00:00:00.000Z', newValue: workItemSnapshot(task(entityId('buyer-1'))) }),
      event({ id: 'o', kind: 'owner_changed', createdAt: '2026-11-09T00:00:00.000Z', field: 'ownerUserId', oldValue: 'buyer-1', newValue: 'buyer-2' }),
      event({ id: 's', kind: 'status_changed', createdAt: '2026-11-09T16:40:00.000Z', field: 'status', oldValue: 'planned', newValue: 'in_progress' }),
    ],
    names: NAMES,
  });
  expect(views.map(ownerLabel)).toEqual(['采购甲', '采购乙', '采购乙']);
});

it('带小数秒和时区偏移的时间按真实时刻比较', () => {
  const later = attributeWorkItemEvents({
    events: [
      event({ id: 'c', kind: 'created', createdAt: '2026-11-09T00:00:00Z', newValue: workItemSnapshot(task(entityId('buyer-1'))) }),
      event({ id: 's-later', kind: 'status_changed', createdAt: '2026-11-09T01:00:00.500Z', field: 'status', oldValue: 'planned', newValue: 'in_progress' }),
      event({ id: 'o', kind: 'owner_changed', createdAt: '2026-11-09T01:00:00Z', field: 'ownerUserId', oldValue: 'buyer-1', newValue: 'buyer-2' }),
    ],
    names: NAMES,
  });
  expect(labels(later)).toEqual([
    ['c', '采购甲'],
    ['o', '采购乙'],
    ['s-later', '采购乙'],
  ]);
  const tied = attributeWorkItemEvents({
    events: [
      event({ id: 'c', kind: 'created', createdAt: '2026-11-09T00:00:00.000Z', newValue: workItemSnapshot(task(entityId('buyer-1'))) }),
      event({ id: 's-tie', kind: 'status_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'status', oldValue: 'planned', newValue: 'in_progress' }),
      event({ id: 'o-tie', kind: 'owner_changed', createdAt: '2026-11-09T09:00:00+08:00', field: 'ownerUserId', oldValue: 'buyer-1', newValue: 'buyer-2' }),
    ],
    names: NAMES,
  });
  const status = tied.find((view) => view.id === 's-tie');
  const change = tied.find((view) => view.id === 'o-tie');
  if (status === undefined || change === undefined) throw new Error('缺同时刻事件');
  expect(ownerLabel(status)).toBe('未知');
  expect(ownerLabel(change)).toBe('采购乙');
});

it('同一时刻有两次对不上的负责人变更时，之后不再沿用', () => {
  const views = attributeWorkItemEvents({
    events: [
      event({ id: 'c', kind: 'created', createdAt: '2026-11-09T00:00:00.000Z', newValue: workItemSnapshot(task(entityId('buyer-1'))) }),
      event({ id: 'o1', kind: 'owner_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'ownerUserId', oldValue: 'buyer-1', newValue: 'buyer-2' }),
      event({ id: 'o2', kind: 'owner_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'ownerUserId', oldValue: 'buyer-2', newValue: null }),
      event({ id: 's', kind: 'status_changed', createdAt: '2026-11-09T02:00:00.000Z', field: 'status', oldValue: 'planned', newValue: 'in_progress' }),
    ],
    names: NAMES,
  });
  expect(views.map(ownerLabel)).toEqual(['采购甲', '采购乙', '未分配', '未知']);
});

it('截断落在同一时刻时，这一组里的负责人都是未知', () => {
  const views = attributeWorkItemEvents({
    events: [
      event({ id: 'c', kind: 'created', createdAt: '2026-11-09T00:00:00.000Z', newValue: workItemSnapshot(task(entityId('buyer-1'))) }),
      event({ id: 's49', kind: 'status_changed', createdAt: '2026-11-09T01:00:00.000Z', field: 'status', oldValue: 'planned', newValue: 'in_progress' }),
      event({ id: 'a-owner', kind: 'owner_changed', createdAt: '2026-11-09T02:00:00.000Z', field: 'ownerUserId', oldValue: 'buyer-1', newValue: 'buyer-2' }),
      event({ id: 's50', kind: 'status_changed', createdAt: '2026-11-09T02:00:00.000Z', field: 'status', oldValue: 'in_progress', newValue: 'blocked' }),
    ],
    names: NAMES,
    openTimestamp: '2026-11-09T02:00:00.000Z',
  });
  expect(views.map(ownerLabel)).toEqual(['采购甲', '采购甲', '未知', '未知']);
  expect(views[2]?.ownerChange).toEqual({ before: { presence: 'unrecorded' }, after: { presence: 'unrecorded' } });
  expect(views[2]?.actor).toEqual({ presence: 'named', userId: 'buyer-1', name: '采购甲' });
});

it('数字、布尔、空串和坏对象都不能当成负责人', () => {
  const badValues = [1, true, [], '', { ownerUserId: false }];
  const views = attributeWorkItemEvents({
    events: badValues.map((newValue, index) => event({
      id: `bad-${index}`,
      kind: 'created',
      createdAt: `2026-11-09T00:00:0${index}.000Z`,
      newValue,
    })),
    names: NAMES,
  });
  expect(views.map(ownerLabel)).toEqual(['未知', '未知', '未知', '未知', '未知']);
});

it('操作人缺失、用户已删除、名字为空时不编造另一个人', () => {
  const missingActor = attributeWorkItemEvents({
    events: [event({ id: 'c', kind: 'created', actorUserId: '', newValue: workItemSnapshot(task(entityId('gone'))) })],
    names: NAMES,
  });
  expect(missingActor[0]?.actor).toEqual({ presence: 'unrecorded' });
  expect(missingActor[0]?.ownerAtEvent).toEqual({ presence: 'deleted', userId: 'gone' });
  const blank = attributeWorkItemEvents({
    events: [event({ id: 'b', kind: 'created', actorUserId: 'blank', newValue: workItemSnapshot(task(entityId('blank'))) })],
    names: NAMES,
  });
  expect(blank[0]?.actor).toEqual({ presence: 'named', userId: 'blank', name: 'blank' });
  expect(blank[0]?.ownerAtEvent).toEqual({ presence: 'named', userId: 'blank', name: 'blank' });
});

it('用户 id 只从操作人和事件里的负责人收集', () => {
  const ids = eventUserIds([
    event({ id: 'c', kind: 'created', actorUserId: '', newValue: workItemSnapshot(task(null)) }),
    event({ id: 'o', kind: 'owner_changed', field: 'ownerUserId', oldValue: null, newValue: 'buyer-2' }),
  ]);
  expect([...ids].sort()).toEqual(['buyer-1', 'buyer-2']);
});

it('补过字段的事件能过合同，缺当时负责人过不了', () => {
  const view = attributeWorkItemEvents({
    events: [event({ id: 'c', kind: 'created', newValue: workItemSnapshot(task(entityId('buyer-1'))) })],
    names: NAMES,
  })[0];
  if (view === undefined) throw new Error('缺事件');
  expect(WorkItemEventViewSchema.parse(view).ownerAtEvent).toEqual({ presence: 'named', userId: 'buyer-1', name: '采购甲' });
  const { ownerAtEvent, ...withoutOwner } = view;
  expect(ownerAtEvent).toEqual({ presence: 'named', userId: 'buyer-1', name: '采购甲' });
  expect(WorkItemEventViewSchema.safeParse(withoutOwner).success).toBe(false);
});

function task(ownerUserId: WorkItem['ownerUserId']): WorkItem {
  return {
    id: entityId('item-1'),
    createdAt: AT,
    updatedAt: AT,
    subjectType: 'standalone',
    subjectId: null,
    kind: 'task',
    title: '写单',
    ownerUserId,
    counterpartyPartyId: null,
    counterpartyRole: null,
    plannedStart: localDate('2026-11-09'),
    plannedEnd: localDate('2026-11-10'),
    status: 'planned',
    priority: 'normal',
    source: 'manual',
    parentId: null,
    version: 0,
  };
}

function event(overrides: Partial<AttributableWorkItemEvent> & Pick<AttributableWorkItemEvent, 'id' | 'kind'>): AttributableWorkItemEvent {
  return {
    workItemId: 'item-1',
    field: null,
    oldValue: null,
    newValue: null,
    actorUserId: 'buyer-1',
    note: null,
    createdAt: AT,
    ...overrides,
  };
}

function labels(views: readonly { readonly id: string; readonly ownerAtEvent: { readonly presence: string; readonly name?: string } }[]): readonly (readonly [string, string])[] {
  return views.map((view) => [view.id, ownerLabel(view)]);
}

function ownerLabel(view: { readonly ownerAtEvent: { readonly presence: string; readonly name?: string } }): string {
  if (view.ownerAtEvent.presence === 'named') return view.ownerAtEvent.name ?? '';
  if (view.ownerAtEvent.presence === 'unassigned') return '未分配';
  if (view.ownerAtEvent.presence === 'deleted') return '已删除';
  return '未知';
}
