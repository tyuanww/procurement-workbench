import { describe, expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import {
  buyerView,
  dashboardQuery,
  dashboardSearch,
  stuckView,
  supplierView,
} from '../../apps/web/src/features/performance/index.js';
import { stuckItem, supplierRow } from './w07-rows.js';

const now = new Date('2026-10-12T16:30:00.000Z');
const held = 'lane=finished&view=suppliers&stage=confirmed&bucket=8-14';

describe('管理看板期间', () => {
  it('五个预设保留已有键，再点一次地址不变', () => {
    expect(dashboardSearch({ current: held, now, patch: { preset: 'recent-month' } })).toBe(
      'preset=recent-month&from=2026-09-13&to=2026-10-13&lane=finished&view=suppliers&stage=confirmed&bucket=8-14',
    );
    expect(dashboardSearch({ current: held, now, patch: { preset: 'this-week' } })).toBe(
      'preset=this-week&from=2026-10-12&to=2026-10-13&lane=finished&view=suppliers&stage=confirmed&bucket=8-14',
    );
    expect(dashboardSearch({ current: held, now, patch: { preset: 'last-week' } })).toBe(
      'preset=last-week&from=2026-10-05&to=2026-10-11&lane=finished&view=suppliers&stage=confirmed&bucket=8-14',
    );
    expect(dashboardSearch({ current: held, now, patch: { preset: 'four-weeks' } })).toBe(
      'preset=four-weeks&from=2026-09-21&to=2026-10-13&lane=finished&view=suppliers&stage=confirmed&bucket=8-14',
    );
    expect(dashboardSearch({ current: held, now, patch: { preset: 'this-month' } })).toBe(
      'preset=this-month&from=2026-10-01&to=2026-10-13&lane=finished&view=suppliers&stage=confirmed&bucket=8-14',
    );
    const lastWeek = dashboardSearch({ current: held, now, patch: { preset: 'last-week' } });
    expect(dashboardSearch({ current: lastWeek, now, patch: { preset: 'last-week' } })).toBe(
      lastWeek,
    );
  });

  it('三月三十日往回一个月停在三月三日', () => {
    const march = new Date('2026-03-30T16:30:00.000Z');
    expect(dashboardSearch({ current: '', now: march, patch: { preset: 'recent-month' } })).toBe(
      'preset=recent-month&from=2026-03-03&to=2026-03-31',
    );
  });

  it('空地址是近一个月、全部、卡点', () => {
    expect(dashboardQuery('', now)).toEqual({
      preset: 'recent-month',
      from: localDate('2026-09-13'),
      to: localDate('2026-10-13'),
      lane: 'all',
      view: 'stuck',
      stage: null,
      bucket: null,
      cause: null,
      card: null,
      page: 1,
    });
  });

  it('只有起止日时芯片是自定义，本周配上日期仍是本周', () => {
    expect(dashboardQuery('from=2026-01-01&to=2026-01-31', now)).toMatchObject({
      preset: 'custom',
      from: localDate('2026-01-01'),
      to: localDate('2026-01-31'),
    });
    expect(dashboardQuery('preset=this-week&from=2026-01-01&to=2026-01-31', now)).toMatchObject({
      preset: 'this-week',
      from: localDate('2026-01-01'),
      to: localDate('2026-01-31'),
    });
    expect(dashboardQuery('preset=nope&from=2026-01-01&to=2026-01-31', now).preset).toBe('custom');
  });

  it('不完整的自定义不改当前地址', () => {
    expect(
      dashboardSearch({
        current: held,
        now,
        patch: { preset: 'custom', from: '2026-02-31', to: '2026-09-30' },
      }),
    ).toBe(held);
  });

  it('换标签不发明期间，全部和卡点从地址里消失', () => {
    expect(
      dashboardSearch({
        current: 'stage=confirmed&bucket=8-14',
        now,
        patch: { view: 'suppliers' },
      }),
    ).toBe('view=suppliers&stage=confirmed&bucket=8-14');
    expect(
      dashboardSearch({
        current: 'view=suppliers&lane=finished',
        now,
        patch: { view: 'stuck', lane: 'all' },
      }),
    ).toBe('');
  });

  it('非法自定义且没有日期时回到近一个月', () => {
    expect(
      dashboardQuery('preset=custom&lane=nope&view=stuck&stage=awaiting_shipment&bucket=99', now)
        .preset,
    ).toBe('recent-month');
  });

  it('15+ 写进地址时加号被编码', () => {
    expect(dashboardSearch({ current: '', now, patch: { stage: 'shipped', bucket: '15+' } })).toBe(
      'stage=shipped&bucket=15%2B',
    );
  });

  it('逾期及分页保存在地址，线别或筛选改变会回到第一页', () => {
    const current = 'lane=finished&card=overdue&page=5';
    expect(dashboardQuery(current, now)).toMatchObject({ lane: 'finished', card: 'overdue', page: 5 });
    expect(dashboardSearch({ current, now, patch: { page: 4 } })).toBe('lane=finished&card=overdue&page=4');
    expect(dashboardSearch({ current, now, patch: { cause: 'missing_owner' } })).toBe('lane=finished&cause=missing_owner&card=overdue');
    expect(dashboardSearch({ current, now, patch: { lane: 'material' } })).toBe('lane=material&card=overdue');
    expect(dashboardSearch({ current, now, patch: { card: null } })).toBe('lane=finished');
    expect(dashboardQuery('page=0&card=unknown', now)).toMatchObject({ card: null, page: 1 });
  });
});

describe('供应商排序和准时率', () => {
  const table = supplierView({
    rows: [
      supplierRow({ partyId: 'e', name: '壬', n: 5, numerator: null, denominator: 0, overdue: 9 }),
      supplierRow({ partyId: 'b', name: '乙', n: 10, numerator: 5, denominator: 10, overdue: 1 }),
      supplierRow({ partyId: 'k', name: '丁', n: 5, numerator: 1, denominator: 5, overdue: 3 }),
      supplierRow({ partyId: 'd', name: '丙', n: 4, numerator: 1, denominator: 4, overdue: 100 }),
      supplierRow({ partyId: 'a', name: '甲', n: 5, numerator: 4, denominator: 5, overdue: 3 }),
      supplierRow({ partyId: 'c', name: '己', n: 2, numerator: 1, denominator: 2, overdue: 0 }),
    ],
  });

  it('样本够的按当前逾期降序，样本少的跟在后面', () => {
    expect(table.map((item) => item.partyId)).toEqual(['e', 'a', 'k', 'b', 'c', 'd']);
    expect(table.map((item) => item.sample)).toEqual([
      'enough',
      'enough',
      'enough',
      'enough',
      'few',
      'few',
    ]);
    expect(table.map((item) => item.href)).toEqual([
      '/parties/e',
      '/parties/a',
      '/parties/k',
      '/parties/b',
      '/parties/c',
      '/parties/d',
    ]);
  });

  it('准时率带上样本数，改期缺失是破折号', () => {
    expect(onTimeOf(table)).toEqual([
      '—（n=5）',
      '80%（n=5）',
      '20%（n=5）',
      '50%（n=10）',
      '样本少（n=2）',
      '样本少（n=4）',
    ]);
    expect(cellText(table, 'dateChanges')).toEqual(['—', '—', '—', '—', '—', '—']);
  });

  it('逾期分子缺失排在数字后面，三分之一显示一位小数', () => {
    const rows = supplierView({
      rows: [
        supplierRow({
          partyId: 'm',
          name: '戊',
          n: 5,
          numerator: 1,
          denominator: 5,
          overdue: null,
        }),
        supplierRow({ partyId: 'n', name: '己', n: 5, numerator: 1, denominator: 3, overdue: 0 }),
      ],
    });
    expect(rows.map((row) => row.partyId)).toEqual(['n', 'm']);
    expect(onTimeOf(rows)).toEqual(['33.3%（n=5）', '20%（n=5）']);
  });

  it('近八周用同一套百分数，缺失是破折号', () => {
    const rows = supplierView({
      rows: [
        supplierRow({
          partyId: 'w',
          name: '庚',
          n: 5,
          numerator: 1,
          denominator: 1,
          overdue: 1,
          weekly: [
            { weekStart: '2026-08-17', rate: 0.8, n: 5 },
            { weekStart: '2026-08-24', rate: null, n: 0 },
          ],
        }),
      ],
    });
    expect(rows[0]?.weeks.map((week) => week.text)).toEqual(['80%', '—']);
  });
});

describe('卡点筛选', () => {
  const stuck = stuckView({
    items: [
      stuckItem({ batchId: 'a', stage: 'confirmed', daysInStage: 9, poRaw: null, nameRaw: '螺栓' }),
      stuckItem({ batchId: 'c', stage: 'confirmed', daysInStage: 12 }),
    ],
    distribution: [
      { stage: 'shipped', buckets: { '0-3': 0, '4-7': 0, '8-14': 0, '15+': 40 } },
      { stage: 'confirmed', buckets: { '0-3': 5, '4-7': 0, '8-14': 2, '15+': 0 } },
    ],
    stage: 'confirmed',
    bucket: '8-14',
  });

  it('服务端筛选的清单保持顺序，色块读全量分布', () => {
    expect(stuck.rows.map((row) => row.batchId)).toEqual(['a', 'c']);
    expect(stuck.rows[0]).toMatchObject({
      po: '—',
      name: '螺栓',
      daysInStage: 9,
      stageLabel: '已确认',
    });
    expect(stuck.dwell.map((row) => row.label)).toEqual(['已发货', '已确认']);
    expect(stuck.dwell[0]?.blocks[3]).toMatchObject({ bucket: '15+', count: 40, isActive: false });
    expect(stuck.dwell[1]?.blocks[2]).toMatchObject({ bucket: '8-14', count: 2, isActive: true });
  });

  it('卡住 0 天仍是 0，空字符串不是破折号', () => {
    const zero = stuckView({
      items: [
        stuckItem({ batchId: 'z', stage: 'confirmed', daysInStage: 0, poRaw: '', nameRaw: null }),
      ],
      distribution: [],
      stage: null,
      bucket: '0-3',
    });
    expect(zero.rows[0]).toMatchObject({ daysInStage: 0, po: '', name: '—' });
  });
});

describe('采购链接', () => {
  const bars = buyerView({
    lane: 'finished',
    rows: [
      {
        buyerId: 'buyer-1',
        name: null,
        openLines: null,
        openBatches: 4,
        overdue: 2,
        dueToday: 1,
        missingDate: 1,
        openExceptions: null,
        followUpsInPeriod: 0,
      },
      {
        buyerId: 'a/b',
        name: '甲',
        openLines: 0,
        openBatches: 1,
        overdue: 0,
        dueToday: 0,
        missingDate: 0,
        openExceptions: 2,
        followUpsInPeriod: null,
      },
    ],
  });

  it('开放批次、逾期和待确认分别可见，订单行链接保留线别', () => {
    expect(bars[0]).toMatchObject({ openBatches: 4, overdue: 2, dueToday: 1, missingDate: 1 });
    expect(bars[1]?.href).toBe('/lines?buyer=a%2Fb&lane=finished');
    expect(bars[0]?.openExceptions).toBe('—');
    expect(bars[1]?.followUpsInPeriod).toBe('—');
  });
});

function onTimeOf(
  rows: readonly { readonly cells: readonly { readonly key: string; readonly text: string }[] }[],
): string[] {
  return cellText(rows, 'onTime');
}

function cellText(
  rows: readonly { readonly cells: readonly { readonly key: string; readonly text: string }[] }[],
  key: string,
): string[] {
  return rows.map((row) => row.cells.find((cell) => cell.key === key)?.text ?? '');
}
