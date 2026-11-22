import { expect, it } from 'vitest';
import { progressInsights, type ProgressRow } from '../../apps/web/src/features/progress/index.js';

function row(input: {
  readonly lineId: string;
  readonly stage: string;
  readonly stay: ProgressRow['stay'];
  readonly arrival: ProgressRow['arrival'];
}): ProgressRow {
  return {
    lineId: input.lineId,
    title: input.lineId,
    po: input.lineId,
    stage: input.stage,
    stageLabel: input.stage,
    daysInStage: 1,
    dayText: '1',
    stay: input.stay,
    nextLabel: '',
    supplierLabel: '',
    arrival: input.arrival,
  };
}

it('进度概览按阶段、停留和到货状态聚合', () => {
  const insight = progressInsights([
    row({ lineId: 'a', stage: 'awaiting_date', stay: '15+', arrival: { kind: 'overdue', dateText: '2026-10-01' } }),
    row({ lineId: 'b', stage: 'awaiting_date', stay: '0-3', arrival: { kind: 'missing', dateText: '—' } }),
    row({ lineId: 'c', stage: 'partially_received', stay: '8-14', arrival: { kind: 'dated', dateText: '2026-10-20' } }),
  ]);
  expect(insight.total).toBe(3);
  expect(insight.overdue).toBe(1);
  expect(insight.missingDate).toBe(1);
  expect(insight.longStay).toBe(1);
  expect(insight.stages).toEqual([
    { key: 'awaiting_date', label: '待确认日期', count: 2, tone: 'warning' },
    { key: 'partially_received', label: '部分收货', count: 1, tone: 'attention' },
  ]);
  expect(insight.stays.map((stay) => stay.count)).toEqual([1, 0, 1, 1]);
});
