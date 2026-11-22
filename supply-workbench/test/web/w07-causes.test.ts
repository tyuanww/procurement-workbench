import { describe, expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import {
  dashboardQuery,
  dashboardSearch,
  stuckView,
} from '../../apps/web/src/features/performance/index.js';
import { causeCounts, CAUSE_LABEL } from '../../apps/web/src/pages/dashboard/cause-filter.js';
import { stuckItem } from './w07-rows.js';

const now = new Date('2026-10-12T16:30:00.000Z');

describe('卡点原因 missing_factory 和 exception_open', () => {
  it('两个新原因写进地址并能解析回来', () => {
    expect(dashboardQuery('cause=missing_factory', now).cause).toBe('missing_factory');
    expect(dashboardQuery('cause=exception_open', now).cause).toBe('exception_open');
    expect(dashboardSearch({ current: '', now, patch: { cause: 'missing_factory' } })).toBe(
      'cause=missing_factory',
    );
    expect(dashboardSearch({ current: '', now, patch: { cause: 'exception_open' } })).toBe(
      'cause=exception_open',
    );
    expect(dashboardQuery('cause=missing_factory', now)).toMatchObject({
      from: localDate('2026-09-13'),
      to: localDate('2026-10-13'),
      lane: 'all',
      view: 'stuck',
    });
  });

  it('缺工厂关联筛选 factoryLinked=false，异常未关闭筛选 exceptionOpen=true', () => {
    const items = [
      stuckItem({ batchId: 'linked-clean', stage: 'confirmed', daysInStage: 9, factoryLinked: true }),
      stuckItem({ batchId: 'no-factory-open-exception', stage: 'confirmed', daysInStage: 4, exceptionOpen: true }),
      stuckItem({ batchId: 'linked-open-exception', stage: 'confirmed', daysInStage: 2, factoryLinked: true, exceptionOpen: true }),
    ];
    const missingFactory = stuckView({ items, distribution: [], stage: null, bucket: null, cause: 'missing_factory' });
    expect(missingFactory.rows.map((row) => row.batchId)).toEqual(['no-factory-open-exception']);
    const exceptionOpen = stuckView({ items, distribution: [], stage: null, bucket: null, cause: 'exception_open' });
    expect(exceptionOpen.rows.map((row) => row.batchId)).toEqual(['no-factory-open-exception', 'linked-open-exception']);
    expect(stuckView({ items, distribution: [], stage: null, bucket: null, cause: null }).rows).toHaveLength(3);
  });
});

describe('卡点原因 supplier_pending 和 bom_missing', () => {
  it('两个新原因写进地址并能解析回来，原 5 个原因仍保留', () => {
    expect(dashboardQuery('cause=supplier_pending', now).cause).toBe('supplier_pending');
    expect(dashboardQuery('cause=bom_missing', now).cause).toBe('bom_missing');
    expect(dashboardSearch({ current: '', now, patch: { cause: 'supplier_pending' } })).toBe('cause=supplier_pending');
    expect(dashboardSearch({ current: '', now, patch: { cause: 'bom_missing' } })).toBe('cause=bom_missing');
    for (const cause of ['missing_owner', 'missing_factory', 'missing_date', 'exception_open', 'aged_15'] as const) {
      expect(dashboardQuery(`cause=${cause}`, now).cause).toBe(cause);
    }
  });

  it('供应商别名待审筛 supplierAliasPending=true，产品缺 BOM 筛 bomMissing=true', () => {
    const items = [
      stuckItem({ batchId: 'clean', stage: 'confirmed', daysInStage: 9, factoryLinked: true }),
      stuckItem({ batchId: 'pending-alias', stage: 'confirmed', daysInStage: 4, supplierAliasPending: true }),
      stuckItem({ batchId: 'no-bom', stage: 'confirmed', daysInStage: 2, bomMissing: true }),
      stuckItem({ batchId: 'both', stage: 'confirmed', daysInStage: 6, supplierAliasPending: true, bomMissing: true }),
    ];
    const supplierPending = stuckView({ items, distribution: [], stage: null, bucket: null, cause: 'supplier_pending' });
    expect(supplierPending.rows.map((row) => row.batchId)).toEqual(['pending-alias', 'both']);
    const bomMissing = stuckView({ items, distribution: [], stage: null, bucket: null, cause: 'bom_missing' });
    expect(bomMissing.rows.map((row) => row.batchId)).toEqual(['no-bom', 'both']);
    expect(stuckView({ items, distribution: [], stage: null, bucket: null, cause: null }).rows).toHaveLength(4);
  });
});

it('CauseFilter 两种新原因的标签和计数', () => {
  const items = [
    stuckItem({ batchId: 'clean', stage: 'confirmed', daysInStage: 1 }),
    stuckItem({ batchId: 'pending-alias', stage: 'confirmed', daysInStage: 1, supplierAliasPending: true }),
    stuckItem({ batchId: 'no-bom', stage: 'confirmed', daysInStage: 1, bomMissing: true }),
    stuckItem({ batchId: 'both', stage: 'confirmed', daysInStage: 1, supplierAliasPending: true, bomMissing: true }),
  ];
  const counts = causeCounts(items);
  expect(counts.supplier_pending).toBe(2);
  expect(counts.bom_missing).toBe(2);
  expect(counts.missing_owner).toBe(4);
  expect(CAUSE_LABEL.supplier_pending).toBe('供应商别名待审');
  expect(CAUSE_LABEL.bom_missing).toBe('产品缺 BOM');
  expect(CAUSE_LABEL.missing_factory).toBe('缺工厂关联');
});

describe('卡点原因 factory_demand_unlinked', () => {
  it('第八个原因写进地址并能解析回来，原 7 个原因仍保留', () => {
    expect(dashboardQuery('cause=factory_demand_unlinked', now).cause).toBe('factory_demand_unlinked');
    expect(dashboardSearch({ current: '', now, patch: { cause: 'factory_demand_unlinked' } })).toBe(
      'cause=factory_demand_unlinked',
    );
    for (const cause of ['missing_owner', 'missing_factory', 'supplier_pending', 'missing_date', 'exception_open', 'aged_15', 'bom_missing'] as const) {
      expect(dashboardQuery(`cause=${cause}`, now).cause).toBe(cause);
    }
  });

  it('工厂出货未关联筛 factoryUnlinked=true，不影响已关联的行', () => {
    const items = [
      stuckItem({ batchId: 'linked', stage: 'confirmed', daysInStage: 9, factoryLinked: true }),
      stuckItem({ batchId: 'unlinked', stage: 'confirmed', daysInStage: 4, factoryUnlinked: true }),
      stuckItem({ batchId: 'unlinked-open-exception', stage: 'confirmed', daysInStage: 2, factoryUnlinked: true, exceptionOpen: true }),
    ];
    const unlinked = stuckView({ items, distribution: [], stage: null, bucket: null, cause: 'factory_demand_unlinked' });
    expect(unlinked.rows.map((row) => row.batchId)).toEqual(['unlinked', 'unlinked-open-exception']);
    expect(stuckView({ items, distribution: [], stage: null, bucket: null, cause: null }).rows).toHaveLength(3);
  });

  it('CauseFilter 第八个原因的标签和计数', () => {
    const items = [
      stuckItem({ batchId: 'clean', stage: 'confirmed', daysInStage: 1 }),
      stuckItem({ batchId: 'unlinked', stage: 'confirmed', daysInStage: 1, factoryUnlinked: true }),
      stuckItem({ batchId: 'unlinked-2', stage: 'confirmed', daysInStage: 1, factoryUnlinked: true, exceptionOpen: true }),
    ];
    const counts = causeCounts(items);
    expect(counts.factory_demand_unlinked).toBe(2);
    expect(CAUSE_LABEL.factory_demand_unlinked).toBe('工厂出货未关联');
    expect(Object.keys(counts)).toHaveLength(8);
    expect(Object.keys(CAUSE_LABEL)).toHaveLength(8);
  });
});
