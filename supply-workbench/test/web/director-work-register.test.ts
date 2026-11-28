import { expect, it } from 'vitest';
import { addDays, localDate } from '../../packages/domain/src/index.js';
import { inView, ownerLoads, workRows } from '../../apps/web/src/pages/director-home/work-register.js';
import { homeRiskBackAddress, homeWorkParams, readHomeWork } from '../../apps/web/src/pages/director-home/home-location.js';
import { sampleRow } from './party-preview-fixture.js';

it('同一订单的多项风险只占一件，按员工 ID 归属，未分配单列', () => {
  const today = localDate('2026-11-25');
  const base = sampleRow({});
  const rows = workRows([
    { ...base, buyer: { id: 'buyer-a', name: '同名员工' }, openExceptionCount: 2,
      nextDue: { batchId: 'batch-a', dateBuyerConfirmed: addDays(today, -1), dateFactoryRequired: addDays(today, -2), overdueDays: 1 } },
    { ...base, id: 'line-2', buyer: { id: 'buyer-b', name: '同名员工' },
      nextDue: { batchId: 'batch-b', dateBuyerConfirmed: addDays(today, 7), dateFactoryRequired: null, overdueDays: null } },
    { ...base, id: 'line-3', stage: 'awaiting_date' },
  ], today);
  expect(rows.filter((row) => inView(row, 'risk')).map(({ signals }) => signals)).toEqual([['overdue', 'late', 'exception']]);
  expect(rows.filter((row) => inView(row, 'watch'))).toHaveLength(2);
  expect(ownerLoads(rows)).toEqual([
    { id: 'buyer-a', name: '同名员工', total: 1, watch: 1, risk: 1 },
    { id: 'unassigned', name: '待分配', total: 1, watch: 1, risk: 0 },
    { id: 'buyer-b', name: '同名员工', total: 1, watch: 0, risk: 0 },
  ]);
});

it('首页风险回址完整保留店铺、表格条件和抽屉，且只能回本站首页', () => {
  const params = new URLSearchParams({
    store: 'dafuyan', view: 'risk', owner: 'buyer-a', signal: 'late', q: '瓶盖 / 成品', sort: 'date', order: 'descend', page: '2', drawer: 'risk',
  });
  const restored = readHomeWork(params);
  expect(restored).toEqual({
    scope: 'brand:达肤妍', filter: { view: 'risk', owner: 'buyer-a', signal: 'late', search: '瓶盖 / 成品' },
    sort: { column: 'date', order: 'descend' }, page: 2, isSearchOpen: true, drawer: 'risk',
  });
  expect(homeWorkParams(restored).toString()).toBe(params.toString());
  expect(homeRiskBackAddress('https://example.test/')).toBeNull();
  expect(homeRiskBackAddress(params + '&return=https%3A%2F%2Fexample.test')).toBe('/home?' + params);
});
