import { describe, expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import {
  canSetStatus, drawerStatusOptions, eventText, isPlanGroupMode, isWorkItemStatus, planBoard, planInsight,
  plannedRangeText, readGroup, shortDate, taskIdOf, taskParam, taskTags, withGroup,
  workItemStatusLabel, workItemStatusTone,
  eventHistoryParts, eventPartyText, type DailyPlan, type WorkItem, type WorkItemEvent, type WorkItemStatus,
} from '../../apps/web/src/features/today/index.js';

const TODAY = '2026-11-09';

function workItem(input: {
  readonly id: string;
  readonly title?: string;
  readonly start: string;
  readonly end: string;
  readonly status?: WorkItemStatus;
  readonly owner?: string | null;
  readonly supplier?: string | null;
  readonly factory?: string | null;
  readonly overdueDays?: number | null;
  readonly priority?: WorkItem['priority'];
  readonly source?: WorkItem['source'];
}): WorkItem {
  return {
    id: input.id,
    subjectType: 'order_line',
    subjectId: 'line-1',
    kind: 'milestone',
    title: filled(input.title, `任务 ${input.id}`),
    ownerUserId: idOf('user-', input.owner),
    ownerName: filled(input.owner, null),
    counterpartyPartyId: null,
    counterpartyRole: null,
    counterpartyName: null,
    plannedStart: localDate(input.start),
    plannedEnd: localDate(input.end),
    status: filled(input.status, 'planned'),
    priority: filled(input.priority, 'normal'),
    source: filled(input.source, 'batch_milestone'),
    parentId: null,
    version: 1,
    overdueDays: filled(input.overdueDays, null),
    orderLine: { id: 'line-1', poRaw: 'P02024700026', nameRaw: '面膜-5片装', itemCodeRaw: null, supplierPartyId: null },
    batch: null,
    supplierPartyId: idOf('party-', input.supplier),
    supplierName: filled(input.supplier, null),
    factoryPartyId: idOf('factory-', input.factory),
    factoryName: filled(input.factory, null),
  };
}

const DUE = workItem({ id: 'due', start: TODAY, end: TODAY, owner: '采购甲', supplier: '样例供应商35', factory: '宜侬', priority: 'high' });
const OVERDUE = workItem({ id: 'overdue', start: '2026-11-06', end: '2026-11-08', owner: '采购乙', supplier: '样例供应商35', overdueDays: 2, status: 'blocked' });
const UNASSIGNED = workItem({ id: 'unassigned', start: '2026-11-07', end: TODAY, supplier: null });

function dailyPlan(items: readonly WorkItem[]): DailyPlan {
  return {
    date: localDate(TODAY),
    asOf: localDate(TODAY),
    total: items.length,
    overdueCount: items.filter((item) => item.overdueDays !== null).length,
    items,
    byOwner: [
      { key: 'user-采购甲', label: '采购甲', items: items.filter((item) => item.ownerName === '采购甲') },
      { key: 'user-采购乙', label: '采购乙', items: items.filter((item) => item.ownerName === '采购乙') },
      { key: 'unassigned', label: '未分配', items: items.filter((item) => item.ownerUserId === null) },
    ].filter((group) => group.items.length > 0),
    bySupplier: [
      { key: 'party-样例供应商35', label: '样例供应商35', items: items.filter((item) => item.supplierName === '样例供应商35') },
      { key: 'unassigned', label: '未指定供应商', items: items.filter((item) => item.supplierPartyId === null) },
    ].filter((group) => group.items.length > 0),
    byFactory: [],
  };
}

function filled<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value;
}

function idOf(prefix: string, name: string | null | undefined): string | null {
  return name === null || name === undefined ? null : `${prefix}${name}`;
}

describe('今日分组参数', () => {
  it('新增排期、负责人和供应商分组，默认仍是等待方', () => {
    expect(readGroup('')).toBe('waiting');
    expect(readGroup('group=reason')).toBe('reason');
    expect(readGroup('group=date')).toBe('date');
    expect(readGroup('group=schedule')).toBe('schedule');
    expect(readGroup('group=owner')).toBe('owner');
    expect(readGroup('group=supplier')).toBe('supplier');
    expect(readGroup('group=bogus')).toBe('waiting');
    expect(isPlanGroupMode('schedule')).toBe(true);
    expect(isPlanGroupMode('waiting')).toBe(false);
  });

  it('切换分组写 URL，等待方删参数，其它分组保留原筛选', () => {
    expect(withGroup({ search: '?reasons=overdue', group: 'schedule' })).toBe('reasons=overdue&group=schedule');
    expect(withGroup({ search: 'reasons=overdue&group=schedule', group: 'waiting' })).toBe('reasons=overdue');
    expect(withGroup({ search: '', group: 'owner' })).toBe('group=owner');
  });
});

describe('任务抽屉 URL 参数', () => {
  it('任务参数带 task: 前缀，普通行 id 不认成任务', () => {
    expect(taskParam('work-1')).toBe('task:work-1');
    expect(taskIdOf('task:work-1')).toBe('work-1');
    expect(taskIdOf('todo-1')).toBeNull();
    expect(taskIdOf('task:')).toBeNull();
    expect(taskIdOf(null)).toBeNull();
  });
});

describe('排期任务状态与标签', () => {
  it('状态文案和状态色走同一张表', () => {
    expect(workItemStatusLabel('planned')).toBe('计划中');
    expect(workItemStatusLabel('in_progress')).toBe('进行中');
    expect(workItemStatusLabel('blocked')).toBe('阻塞');
    expect(workItemStatusLabel('done')).toBe('已完成');
    expect(workItemStatusTone('blocked')).toBe('danger');
    expect(workItemStatusTone('done')).toBe('success');
    expect(isWorkItemStatus('planned')).toBe(true);
    expect(isWorkItemStatus('unknown')).toBe(false);
  });

  it('状态机只允许计划到进行、进行到阻塞或完成、阻塞回进行、任意到取消', () => {
    expect(canSetStatus('planned', 'in_progress')).toBe(true);
    expect(canSetStatus('planned', 'done')).toBe(false);
    expect(canSetStatus('in_progress', 'blocked')).toBe(true);
    expect(canSetStatus('in_progress', 'done')).toBe(true);
    expect(canSetStatus('blocked', 'in_progress')).toBe(true);
    expect(canSetStatus('done', 'planned')).toBe(false);
    expect(canSetStatus('cancelled', 'planned')).toBe(false);
    expect(canSetStatus('done', 'cancelled')).toBe(true);
    expect(drawerStatusOptions()).toEqual(['planned', 'in_progress', 'blocked', 'done']);
  });

  it('没有负责人时明确写未分配，不冒充当前用户', () => {
    const tags = taskTags(UNASSIGNED, TODAY);
    const owner = tags.find((tag) => tag.key === 'owner');
    expect(owner?.label).toBe('负责人 未分配');
    expect(owner?.tone).toBe('warning');
    expect(owner?.fill).toBe('outline');
    expect(taskTags(DUE, TODAY).find((tag) => tag.key === 'owner')?.label).toBe('负责人 采购甲');
  });

  it('来源、供应商、工厂、状态和到期标签都在', () => {
    const labels = taskTags(DUE, TODAY).map((tag) => tag.label);
    expect(labels).toContain('来源 排期任务');
    expect(labels).toContain('供应商 样例供应商35');
    expect(labels).toContain('工厂 宜侬');
    expect(labels).toContain('计划中');
    expect(labels).toContain('今日应到');
    const overdue = taskTags(OVERDUE, TODAY).map((tag) => tag.label);
    expect(overdue).toContain('阻塞');
    expect(overdue).toContain('逾期 2 天');
  });

  it('事件历史按字段和值生成中文说明', () => {
    expect(eventText(event({ kind: 'created', field: null, oldValue: null, newValue: { title: 'x' } }))).toBe('创建任务');
    expect(eventText(event({ kind: 'status_changed', field: 'status', oldValue: 'planned', newValue: 'in_progress' }))).toBe('状态从 计划中 改为 进行中');
    expect(eventText(event({ kind: 'date_changed', field: 'plannedStart', oldValue: '2026-11-01', newValue: '2026-11-02' }))).toContain('2026-11-01');
    expect(eventText(event({ kind: 'owner_changed', ownerChange: null }))).toBe('负责人变更');
  });

  it('历史行同时写出实际操作人和事件当时负责人，未知和未分配分开', () => {
    expect(eventPartyText({ presence: 'named', userId: 'u', name: '采购甲' })).toBe('采购甲');
    expect(eventPartyText({ presence: 'deleted', userId: 'u' })).toBe('已删除');
    expect(eventPartyText({ presence: 'unassigned' })).toBe('未分配');
    expect(eventPartyText({ presence: 'unrecorded' })).toBe('未知');
    const parts = eventHistoryParts(event({
      kind: 'owner_changed',
      actor: { presence: 'deleted', userId: 'actor-1' },
      ownerAtEvent: { presence: 'named', userId: 'u', name: '采购乙' },
      ownerChange: { before: { presence: 'unassigned' }, after: { presence: 'named', userId: 'u', name: '采购乙' } },
    }));
    expect(parts).toEqual({
      sentence: '负责人从 未分配 改为 采购乙',
      actor: '实际操作人 已删除',
      owner: '当时负责人 采购乙',
    });
  });
});

describe('日期显示', () => {
  it('同一年写 MM-DD，跨年写 YYYY-MM-DD', () => {
    expect(shortDate('2026-11-09', '2026-11-09')).toBe('11-09');
    expect(shortDate('2027-01-02', '2026-11-09')).toBe('2027-01-02');
    expect(plannedRangeText(workItem({ id: 'x', start: TODAY, end: TODAY }), TODAY)).toBe('11-09');
    expect(plannedRangeText(workItem({ id: 'x', start: '2026-11-08', end: '2026-11-10' }), TODAY)).toBe('11-08 至 11-10');
  });
});

describe('今日排期看板', () => {
  it('排期分组先今天到期再逾期，各带任务和高优先计数', () => {
    const board = planBoard({ view: dailyPlan([DUE, OVERDUE, UNASSIGNED]), group: 'schedule' });
    expect(board.kind).toBe('groups');
    if (board.kind !== 'groups') throw new Error('expected groups');
    expect(board.groups.map((group) => group.name)).toEqual(['今天到期', '逾期']);
    expect(board.groups[0]?.counts).toEqual([{ label: '任务', count: 2 }, { label: '高优先', count: 1 }]);
    expect(board.groups[1]?.counts).toEqual([{ label: '任务', count: 1 }]);
    expect(board.groups[1]?.note).toBe('平均逾期 2 天');
    expect(board.rows.map((row) => row.id)).toEqual(['task:due', 'task:unassigned', 'task:overdue']);
    expect(board.groups[0]?.rows[0]?.meta).toContain('P02024700026');
  });

  it('负责人分组把未分配单独成组，计数含逾期和阻塞', () => {
    const board = planBoard({ view: dailyPlan([DUE, OVERDUE, UNASSIGNED]), group: 'owner' });
    if (board.kind !== 'groups') throw new Error('expected groups');
    expect(board.groups.map((group) => group.name)).toEqual(['采购甲', '采购乙', '未分配']);
    const unassigned = board.groups[2];
    expect(unassigned?.isUnassigned).toBe(true);
    expect(unassigned?.note).toBe('需指派');
    expect(board.groups[1]?.counts).toEqual([{ label: '任务', count: 1 }, { label: '逾期', count: 1 }, { label: '阻塞', count: 1 }]);
  });

  it('供应商分组用未指定供应商兜底', () => {
    const board = planBoard({ view: dailyPlan([DUE, OVERDUE, UNASSIGNED]), group: 'supplier' });
    if (board.kind !== 'groups') throw new Error('expected groups');
    expect(board.groups.map((group) => group.name)).toEqual(['样例供应商35', '未指定供应商']);
  });

  it('今日没有排期时返回空态文案，指标不造假', () => {
    const board = planBoard({ view: dailyPlan([]), group: 'schedule' });
    expect(board).toEqual({ kind: 'empty', text: '今天没有到期的排期任务。' });
    expect(planInsight(dailyPlan([]))).toEqual({ total: 0, urgent: 0, overdue: 0, unassigned: 0 });
    expect(planInsight(dailyPlan([DUE, OVERDUE, UNASSIGNED]))).toEqual({ total: 3, urgent: 1, overdue: 1, unassigned: 1 });
  });
});

function event(overrides: Partial<WorkItemEvent> & { readonly kind: WorkItemEvent['kind'] }): WorkItemEvent {
  return {
    id: 'event-1',
    workItemId: 'due',
    field: null,
    oldValue: null,
    newValue: null,
    actorUserId: 'user-1',
    actor: { presence: 'named', userId: 'user-1', name: '采购甲' },
    ownerAtEvent: { presence: 'unrecorded' },
    ownerChange: null,
    note: null,
    createdAt: '2026-11-09T01:00:00.000Z',
    ...overrides,
  };
}
