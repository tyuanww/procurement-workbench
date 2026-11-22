import { expect, it } from 'vitest';
import { todayInsights, type BoardItem } from '../../apps/web/src/features/today/index.js';

function item(input: { readonly id: string; readonly severity: number; readonly reasons: readonly string[] }): BoardItem {
  return {
    id: input.id,
    severity: input.severity,
    overdueDays: null,
    dueDate: null,
    lineId: input.id,
    waitingName: '供应商',
    reasons: input.reasons,
    poRaw: null,
    productName: null,
    qty: null,
    batchStatus: null,
  };
}

it('今日概览只统计需要行动的行', () => {
  const insight = todayInsights([
    item({ id: 'a', severity: 3, reasons: ['overdue'] }),
    item({ id: 'b', severity: 2, reasons: ['missing_date'] }),
    item({ id: 'c', severity: 1, reasons: ['upcoming', 'missing_date'] }),
  ]);
  expect(insight).toEqual({ total: 3, urgent: 2, overdue: 1, missingDate: 2 });
});
