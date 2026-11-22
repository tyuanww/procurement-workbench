import { expect, it } from 'vitest';
import { STUCK_CAUSES } from '../../packages/domain/src/index.js';
import { dashboardQuery, dashboardSearch } from '../../apps/web/src/features/performance/index.js';
import { CAUSE_LABEL } from '../../apps/web/src/pages/dashboard/cause-filter.js';

const now = new Date('2026-10-12T16:30:00.000Z');

it('八类卡点原因可保留在地址中，并各有可读标签', () => {
  for (const cause of STUCK_CAUSES) {
    expect(dashboardSearch({ current: '', now, patch: { cause } })).toBe(`cause=${cause}`);
    expect(dashboardQuery(`cause=${cause}`, now).cause).toBe(cause);
  }
  expect(CAUSE_LABEL).toEqual({
    missing_owner: '缺负责人',
    missing_factory: '缺工厂关联',
    supplier_pending: '供应商别名待审',
    bom_missing: '产品缺 BOM',
    factory_demand_unlinked: '工厂出货未关联',
    missing_date: '缺确认日期',
    exception_open: '异常未关闭',
    aged_15: '停留 15 天以上',
  });
});
