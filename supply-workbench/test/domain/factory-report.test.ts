import { expect, it } from 'vitest';
import { derivedZeroValue, isDerivedNegative, isFactoryMismatch } from '../../packages/domain/src/index.js';

it('供应商和所选代工厂规范化后不同才算不一致', () => {
  expect(isFactoryMismatch('丁印刷厂', '甲代工厂')).toBe(true);
  expect(isFactoryMismatch(' 甲代工厂 ', '甲代工厂')).toBe(false);
  expect(isFactoryMismatch(null, '甲代工厂')).toBe(false);
  expect(isFactoryMismatch('', '甲代工厂')).toBe(false);
});

it('没有来源行的 0 不是实际为零，负数另计', () => {
  expect(derivedZeroValue(0, false)).toBeNull();
  expect(derivedZeroValue(0, true)).toBe(0);
  expect(derivedZeroValue(3, false)).toBe(3);
  expect(isDerivedNegative(-1)).toBe(true);
  expect(isDerivedNegative(0)).toBe(false);
  expect(isDerivedNegative(null)).toBe(false);
});
