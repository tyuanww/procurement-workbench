import { expect, it } from 'vitest';
import { inclusiveScheduleDays, localDate, procurementDraft } from '../../packages/domain/src/index.js';

it('排期窗口含首尾，跨年、跨月和闰日按自然日计算', () => {
  expect(inclusiveScheduleDays(localDate('2026-04-14'), localDate('2026-06-14'))).toBe(62);
  expect(inclusiveScheduleDays(localDate('2026-04-22'), localDate('2026-06-14'))).toBe(54);
  expect(inclusiveScheduleDays(localDate('2026-12-31'), localDate('2027-01-01'))).toBe(2);
  expect(inclusiveScheduleDays(localDate('2028-02-28'), localDate('2028-03-01'))).toBe(3);
  expect(inclusiveScheduleDays(localDate('2026-06-14'), localDate('2026-06-14'))).toBe(1);
  expect(inclusiveScheduleDays(localDate('2026-06-15'), localDate('2026-06-14'))).toBeNull();
  expect(inclusiveScheduleDays(null, localDate('2026-06-14'))).toBeNull();
});

it('已核实周期从下单日顺排，允许明确确认的当日齐料和交付', () => {
  const orderOn = localDate('2026-11-30');
  expect(procurementDraft({ orderOn, cycle: { materialsDays: 0, productionDays: 2, deliveryDays: 0, basis: '测试依据' } })).toEqual({
    order: { start: '2026-11-30', end: '2026-11-30' },
    materials: { start: '2026-11-30', end: '2026-11-30' },
    production: { start: '2026-12-01', end: '2026-12-02' },
    delivery: { start: '2026-12-02', end: '2026-12-02' },
  });
});
