import { expect, it } from 'vitest';
import { reportedProcurementGap, reportedProcurementQuantity } from '../../packages/application/src/follow-up/store-progress.js';

it.each([
  { report: '截止10/29已送158000，剩余11/12送到', unit: '个', gap: 42_000 },
  { report: '已交付 15.8万个；剩余待确定', unit: '个', gap: 42_000 },
  { report: '已送158,000 个', unit: '个', gap: 42_000 },
  { report: '已送158000', unit: null, gap: null },
  { report: '已送158000件', unit: '个', gap: null },
  { report: '计划在周五送158000', unit: '个', gap: null },
  { report: '讨论结果，预计已送158000', unit: '个', gap: null },
  { report: '已送100000；已送58000', unit: '个', gap: null },
  { report: '已送210000', unit: '个', gap: null },
  { report: null, unit: '个', gap: null },
])('按有据的原文和确定单位计算报告差额 $report', ({ report, unit, gap }) => {
  expect(reportedProcurementGap({ quantity: 200_000, unit, deliveryProgressRaw: report })).toBe(gap);
});

it('保留缺单位的同一来源行报告数量，单位冲突和不确定措辞仍待核对', () => {
  expect(reportedProcurementQuantity('截止10/29已送158000，剩余11/12送到', null)).toBe(158_000);
  expect(reportedProcurementQuantity('已送158000件', null)).toBeNull();
  expect(reportedProcurementQuantity('预计已送158000', null)).toBeNull();
});
