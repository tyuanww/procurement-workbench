import { expect, it } from 'vitest';
import { addDays, localDate } from '../../packages/domain/src/index.js';
import { inView, ownerLoads, workRows } from '../../apps/web/src/pages/director-home/work-register.js';
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
