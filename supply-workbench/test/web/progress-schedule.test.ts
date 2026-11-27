import { describe, expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import {
  applyScheduleFilters, emptyScheduleFilters, readScheduleQuery, scheduleDays, scheduleKpi, scheduleOptions,
  scheduleWindow, scheduleWindowLabel, shiftScheduleWindow, statusOptions, timelineOf, todayPercent, writeScheduleQuery,
  type ScheduleFilters,
} from '../../apps/web/src/features/progress/index.js';
import type { WorkItem, WorkItemStatus } from '../../apps/web/src/features/today/index.js';

const TODAY = localDate('2026-11-09');

function workItem(input: {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly owner?: string | null;
  readonly supplier?: string | null;
  readonly factory?: string | null;
  readonly status?: WorkItemStatus;
  readonly overdueDays?: number | null;
}): WorkItem {
  return {
    id: input.id,
    subjectType: 'order_line',
    subjectId: 'line-1',
    kind: 'milestone',
    title: `任务 ${input.id}`,
    ownerUserId: idOf('user-', input.owner),
    ownerName: filled(input.owner, null),
    counterpartyPartyId: null,
    counterpartyRole: null,
    counterpartyName: null,
    plannedStart: localDate(input.start),
    plannedEnd: localDate(input.end),
    status: filled(input.status, 'planned'),
    priority: 'normal',
    source: 'batch_milestone',
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

function filled<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value;
}

function idOf(prefix: string, name: string | null | undefined): string | null {
  return name === null || name === undefined ? null : `${prefix}${name}`;
}

function filter(overrides: Partial<ScheduleFilters>): ScheduleFilters {
  return { ...emptyScheduleFilters(), ...overrides };
}

describe('总排期周期', () => {
  it('日刻度保留 URL 锚点，用一个日期查询并逐日跨月翻页', () => {
    const anchor = localDate('2026-11-30');
    const query = readScheduleQuery('scale=day&from=2026-11-30', TODAY);
    expect(query).toMatchObject({ scale: 'day', anchor });
    const window = scheduleWindow(query);
    expect(window).toEqual({ from: anchor, to: anchor });
    expect(scheduleWindowLabel({ window, today: TODAY })).toBe('11-30');
    expect(scheduleDays({ window, today: TODAY, scale: 'day' })).toHaveLength(1);
    expect(shiftScheduleWindow({ scale: 'day', window, direction: -1 }))
      .toEqual({ from: localDate('2026-11-29'), to: localDate('2026-11-29') });
    expect(shiftScheduleWindow({ scale: 'day', window, direction: 1 }))
      .toEqual({ from: localDate('2026-12-01'), to: localDate('2026-12-01') });
    expect(readScheduleQuery(writeScheduleQuery({ search: '', query }), TODAY)).toEqual(query);
  });

  it('周从周一开始到周日，包含今天', () => {
    expect(scheduleWindow({ scale: 'week', anchor: TODAY })).toEqual({ from: localDate('2026-11-09'), to: localDate('2026-11-15') });
    expect(scheduleWindow({ scale: 'week', anchor: localDate('2026-11-11') })).toEqual({ from: localDate('2026-11-09'), to: localDate('2026-11-15') });
    expect(scheduleWindowLabel({ window: scheduleWindow({ scale: 'week', anchor: TODAY }), today: TODAY })).toBe('11-09 至 11-15');
  });

  it('月从 1 日到月末，跨月翻页不跳到下个月中间', () => {
    expect(scheduleWindow({ scale: 'month', anchor: TODAY })).toEqual({ from: localDate('2026-11-01'), to: localDate('2026-11-30') });
    expect(scheduleWindow({ scale: 'month', anchor: localDate('2026-02-15') })).toEqual({ from: localDate('2026-02-01'), to: localDate('2026-02-28') });
  });

  it('前后翻页按窗口边界算，跨年周仍然完整', () => {
    const week = scheduleWindow({ scale: 'week', anchor: TODAY });
    expect(shiftScheduleWindow({ scale: 'week', window: week, direction: 1 })).toEqual({ from: localDate('2026-11-16'), to: localDate('2026-11-22') });
    expect(shiftScheduleWindow({ scale: 'week', window: week, direction: -1 })).toEqual({ from: localDate('2026-11-02'), to: localDate('2026-11-08') });
    const yearEnd = scheduleWindow({ scale: 'week', anchor: localDate('2026-12-30') });
    expect(yearEnd).toEqual({ from: localDate('2026-12-28'), to: localDate('2027-01-03') });
    expect(scheduleWindowLabel({ window: yearEnd, today: TODAY })).toBe('12-28 至 2027-01-03');
  });

  it('月刻度日期表头给日号和周几，周末和今天有标记', () => {
    const days = scheduleDays({ window: scheduleWindow({ scale: 'month', anchor: TODAY }), today: TODAY, scale: 'month' });
    expect(days.length).toBe(30);
    expect(days[8]).toEqual({ date: localDate('2026-11-09'), label: '9', weekday: '一', isToday: true, isWeekend: false });
    expect(days[13]?.isWeekend).toBe(true);
    expect(days[14]?.isWeekend).toBe(true);
  });
});

describe('总排期筛选参数', () => {
  it('从 URL 读刻度和四个筛选，非法状态回落到空', () => {
    const query = readScheduleQuery('view=schedule&scale=month&from=2026-11-01&ownerUserId=u1&supplierPartyId=p1&factoryPartyId=f1&status=blocked', TODAY);
    expect(query.scale).toBe('month');
    expect(query.anchor).toEqual(localDate('2026-11-01'));
    expect(query.filters).toEqual({ ownerUserId: 'u1', supplierPartyId: 'p1', factoryPartyId: 'f1', status: 'blocked' });
    expect(readScheduleQuery('scale=month&status=bogus', TODAY).filters.status).toBeNull();
    expect(readScheduleQuery('from=not-a-date', TODAY).anchor).toEqual(TODAY);
    expect(readScheduleQuery('', TODAY).scale).toBe('week');
  });

  it('写 URL 带 view=schedule、刻度和 from，清空筛选时删参数', () => {
    const written = writeScheduleQuery({
      search: 'view=schedule&drawer=task%3A1',
      query: { scale: 'month', anchor: localDate('2026-11-01'), filters: filter({ ownerUserId: 'u1', status: 'blocked' }) },
    });
    const params = new URLSearchParams(written);
    expect(params.get('view')).toBe('schedule');
    expect(params.get('scale')).toBe('month');
    expect(params.get('from')).toBe('2026-11-01');
    expect(params.get('ownerUserId')).toBe('u1');
    expect(params.get('status')).toBe('blocked');
    expect(params.get('drawer')).toBe('task:1');
    const cleared = new URLSearchParams(writeScheduleQuery({ search: written, query: { scale: 'week', anchor: TODAY, filters: emptyScheduleFilters() } }));
    expect(cleared.get('ownerUserId')).toBeNull();
    expect(cleared.get('status')).toBeNull();
  });

  it('负责人、供应商、工厂和状态可以组合过滤，未分配用 unassigned 命中空值', () => {
    const items = [
      workItem({ id: 'a', start: '2026-11-09', end: '2026-11-10', owner: '采购甲', supplier: '样例供应商35', factory: '宜侬', status: 'in_progress' }),
      workItem({ id: 'b', start: '2026-11-09', end: '2026-11-09', status: 'blocked' }),
      workItem({ id: 'c', start: '2026-11-11', end: '2026-11-12', owner: '采购甲' }),
    ];
    expect(applyScheduleFilters({ items, filters: emptyScheduleFilters() }).length).toBe(3);
    expect(applyScheduleFilters({ items, filters: filter({ ownerUserId: 'user-采购甲' }) }).map((item) => item.id)).toEqual(['a', 'c']);
    expect(applyScheduleFilters({ items, filters: filter({ ownerUserId: 'unassigned' }) }).map((item) => item.id)).toEqual(['b']);
    expect(applyScheduleFilters({ items, filters: filter({ supplierPartyId: 'unassigned' }) }).map((item) => item.id)).toEqual(['b', 'c']);
    expect(applyScheduleFilters({ items, filters: filter({ factoryPartyId: 'factory-宜侬' }) }).map((item) => item.id)).toEqual(['a']);
    expect(applyScheduleFilters({ items, filters: filter({ status: 'blocked' }) }).map((item) => item.id)).toEqual(['b']);
  });

  it('筛选下拉列出实际出现的负责人、供应商和工厂，未分配排最后', () => {
    const options = scheduleOptions([
      workItem({ id: 'a', start: '2026-11-09', end: '2026-11-09', owner: '采购甲', supplier: '样例供应商35', factory: '宜侬' }),
      workItem({ id: 'b', start: '2026-11-09', end: '2026-11-09', owner: '采购甲', supplier: '样例供应商35' }),
      workItem({ id: 'c', start: '2026-11-09', end: '2026-11-09' }),
    ]);
    expect(options.owners).toEqual([{ value: 'user-采购甲', label: '采购甲' }, { value: 'unassigned', label: '未分配' }]);
    expect(options.suppliers).toEqual([{ value: 'party-样例供应商35', label: '样例供应商35' }, { value: 'unassigned', label: '未指定供应商' }]);
    expect(options.factories).toEqual([{ value: 'factory-宜侬', label: '宜侬' }, { value: 'unassigned', label: '未指定工厂' }]);
    expect(statusOptions().map((option) => option.value)).toEqual(['planned', 'in_progress', 'blocked']);
  });
});

describe('总排期指标', () => {
  it('总数、进行中、逾期和阻塞', () => {
    const items = [
      workItem({ id: 'a', start: '2026-11-09', end: '2026-11-09', status: 'in_progress', overdueDays: 1 }),
      workItem({ id: 'b', start: '2026-11-09', end: '2026-11-09', status: 'blocked' }),
      workItem({ id: 'c', start: '2026-11-09', end: '2026-11-09' }),
    ];
    expect(scheduleKpi(items)).toEqual({ total: 3, inProgress: 1, overdue: 1, blocked: 1 });
  });
});

describe('时间轴布局', () => {
  it('单日、跨周和跨月任务按比例定位，截断标记正确', () => {
    const window = scheduleWindow({ scale: 'week', anchor: TODAY });
    const timeline = timelineOf({
      items: [
        workItem({ id: 'cut-start', start: '2026-11-06', end: '2026-11-10' }),
        workItem({ id: 'cut-end', start: '2026-11-10', end: '2026-11-20' }),
        workItem({ id: 'single', start: '2026-11-09', end: '2026-11-09' }),
      ],
      window,
      today: TODAY,
      scale: 'week',
    });
    const rows = timeline.groups.flatMap((group) => group.rows);
    const byId = new Map(rows.map((row) => [row.workItemId, row]));
    expect(byId.get('cut-start')?.bar.isCutStart).toBe(true);
    expect(byId.get('cut-start')?.bar.leftPercent).toBe(0);
    expect(byId.get('cut-start')?.bar.widthPercent).toBeCloseTo((2 / 7) * 100);
    expect(byId.get('cut-end')?.bar.isCutEnd).toBe(true);
    expect(byId.get('cut-end')?.bar.leftPercent).toBeCloseTo((1 / 7) * 100);
    expect(byId.get('cut-end')?.bar.widthPercent).toBeCloseTo((6 / 7) * 100);
    expect(byId.get('single')?.bar.isCutStart).toBe(false);
    expect(byId.get('single')?.bar.widthPercent).toBeCloseTo((1 / 7) * 100);
    expect(byId.get('single')?.id).toBe('task:single');
  });

  it('按负责人分组，未分配放最后，今天竖线只在范围内出现', () => {
    const window = scheduleWindow({ scale: 'week', anchor: TODAY });
    const timeline = timelineOf({
      items: [
        workItem({ id: 'b', start: '2026-11-09', end: '2026-11-09', status: 'blocked' }),
        workItem({ id: 'a', start: '2026-11-09', end: '2026-11-09', owner: '采购甲' }),
        workItem({ id: 'c', start: '2026-11-10', end: '2026-11-10', owner: '采购甲' }),
      ],
      window,
      today: TODAY,
      scale: 'week',
    });
    expect(timeline.groups.map((group) => group.name)).toEqual(['采购甲', '未分配']);
    expect(timeline.groups[0]?.counts).toBe('2 条 · 逾期 0 · 阻塞 0');
    expect(timeline.groups[1]?.counts).toBe('1 条 · 逾期 0 · 阻塞 1');
    expect(timeline.total).toBe(3);
    expect(timeline.todayPercent).toBe(0);
    expect(todayPercent({ window: scheduleWindow({ scale: 'week', anchor: localDate('2026-11-16') }), today: TODAY })).toBeNull();
  });

  it('月刻度有 30 天，星期表头完整', () => {
    const timeline = timelineOf({ items: [], window: scheduleWindow({ scale: 'month', anchor: TODAY }), today: TODAY, scale: 'month' });
    expect(timeline.days.length).toBe(30);
    expect(timeline.days.every((day) => day.weekday !== '')).toBe(true);
    expect(timeline.groups).toEqual([]);
  });
});
