import { expect, it } from 'vitest';
import { matchesProgressDrill, progressInsights, readProgressDrill, withProgressDrill, type ProgressRow } from '../../apps/web/src/features/progress/index.js';

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
    materialRisks: [],
    supplierLabel: '',
    arrival: input.arrival,
  };
}

it('待建与待确认分别按订单行阶段计数并下钻，保留店铺及 OA', () => {
  const rows = [
    row({ lineId: 'a', stage: 'no_batch', stay: '15+', arrival: { kind: 'missing', dateText: '—' } }),
    row({ lineId: 'b', stage: 'awaiting_date', stay: '0-3', arrival: { kind: 'missing', dateText: '—' } }),
    row({ lineId: 'c', stage: 'no_batch', stay: '8-14', arrival: { kind: 'missing', dateText: '—' } }),
    row({ lineId: 'd', stage: 'partially_received', stay: '4-7', arrival: { kind: 'overdue', dateText: '2026-10-01' } }),
  ];
  const insight = progressInsights(rows);
  expect(insight).toMatchObject({ total: 4, overdue: 1, pendingBatch: 2, awaitingDate: 1, longStay: 1 });
  expect(insight.stages).toEqual([
    { key: 'no_batch', label: '待建批次', count: 2, tone: 'neutral' },
    { key: 'awaiting_date', label: '已有批次待确认', count: 1, tone: 'warning' },
    { key: 'partially_received', label: '部分收货', count: 1, tone: 'attention' },
  ]);
  expect(insight.stays.map((stay) => stay.count)).toEqual([1, 1, 1, 1]);
  const params = withProgressDrill(new URLSearchParams('store=dafuyan&oa=OA-11'), { kind: 'stage', stage: 'awaiting_date' });
  expect(Object.fromEntries(params)).toEqual({ store: 'dafuyan', oa: 'OA-11', drill: 'stage:awaiting_date' });
  const ids = (value: string | null) => rows.filter((item) => matchesProgressDrill(item, readProgressDrill(value))).map((item) => item.lineId);
  expect(ids(params.get('drill'))).toEqual(['b']);
  expect(ids('stage:no_batch')).toEqual(['a', 'c']);
  expect(ids('stay:15+')).toEqual(['a']);
  expect(ids('overdue')).toEqual(['d']);
  expect(Object.fromEntries(withProgressDrill(params, { kind: 'all' }))).toEqual({ store: 'dafuyan', oa: 'OA-11' });
});
