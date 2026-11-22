import { expect, it } from 'vitest';
import { localDate, recentMonth } from '../../packages/domain/src/index.js';

it('近一个月用公历溢出，三月三十一日回到三月三日', () => {
  expect(recentMonth(localDate('2026-03-31'))).toEqual({ from: localDate('2026-03-03'), to: localDate('2026-03-31') });
  expect(recentMonth(localDate('2026-10-12'))).toEqual({ from: localDate('2026-09-12'), to: localDate('2026-10-12') });
  expect(recentMonth(localDate('2026-11-03'))).toEqual({ from: localDate('2026-10-03'), to: localDate('2026-11-03') });
});
