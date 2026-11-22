import { expect, it } from 'vitest';
import { parseQty } from '../../packages/importers/src/index.js';

function textCell(text: string) {
  return { kind: 'string' as const, value: text, text };
}

function numberCell(value: number, formula?: string) {
  return formula === undefined
    ? { kind: 'number' as const, value, text: String(value) }
    : { kind: 'number' as const, value, text: String(value), formula };
}

function codes(text: string): string[] {
  return parseQty(textCell(text)).issues.map((issue) => issue.code);
}

it('1,234 去掉千分位，报 QTY_THOUSANDS_SEP', () => {
  const parsed = parseQty(textCell('1,234'));
  expect(parsed.value).toBe(1234);
  expect(codes('1,234')).toEqual(['QTY_THOUSANDS_SEP']);
  expect(parsed.issues[0]?.severity).toBe('info');
});

it('165w、165W、165万 按万换算', () => {
  for (const text of ['165w', '165W', '165万']) {
    const parsed = parseQty(textCell(text));
    expect(parsed.value, text).toBe(1_650_000);
    expect(parsed.issues.map((issue) => issue.code), text).toEqual(['QTY_WAN']);
  }
});

it('公式错误值置空，报 FORMULA_ERROR', () => {
  for (const text of ['#VALUE!', '#DIV/0!', '#REF!', '#N/A', '#NAME?']) {
    const parsed = parseQty(textCell(text));
    expect(parsed.value, text).toBeNull();
    expect(parsed.issues.map((issue) => issue.code), text).toEqual(['FORMULA_ERROR']);
    expect(parsed.missingReason, text).toBe('unparseable');
  }
});

it('数量负数照收，不报问题', () => {
  const parsed = parseQty(textCell('-8'));
  expect(parsed.value).toBe(-8);
  expect(parsed.issues).toEqual([]);
  expect(parsed.missingReason).toBeUndefined();
});

it('数量格的文字置空，斜杠是未填写', () => {
  expect(parseQty(textCell('客户自提')).issues.map((issue) => issue.code)).toEqual(['QTY_TEXT']);
  expect(parseQty(textCell('客户自提')).value).toBeNull();
  const blank = parseQty(textCell('/'));
  expect(blank.value).toBeNull();
  expect(blank.issues).toEqual([]);
  expect(blank.missingReason).toBe('not_provided');
});

it('数字单元格直接取，0 不是缺失；公式另记 FORMULA_VALUE', () => {
  expect(parseQty(numberCell(0)).value).toBe(0);
  expect(parseQty(numberCell(0)).issues).toEqual([]);
  expect(parseQty(numberCell(0)).missingReason).toBeUndefined();
  const cached = parseQty(numberCell(12, '=6*2'));
  expect(cached.value).toBe(12);
  expect(cached.issues.map((issue) => issue.code)).toEqual(['FORMULA_VALUE']);
});

it('千分位和万可以同时出现', () => {
  const parsed = parseQty(textCell('1,234w'));
  expect(parsed.value).toBe(12_340_000);
  expect(parsed.issues.map((issue) => issue.code)).toEqual(['QTY_WAN', 'QTY_THOUSANDS_SEP']);
});
