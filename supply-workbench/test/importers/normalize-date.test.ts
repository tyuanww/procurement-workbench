import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS, localDate } from '../../packages/domain/src/index.js';
import { parseDate } from '../../packages/importers/src/index.js';
import { excelSerialToLocalDate } from '../../packages/importers/src/workbook/excel-date.js';

const day = localDate;

function textCell(text: string) {
  return { kind: 'string' as const, value: text, text };
}

function numberCell(value: number, formula?: string) {
  return formula === undefined
    ? { kind: 'number' as const, value, text: String(value) }
    : { kind: 'number' as const, value, text: String(value), formula };
}

function options(isDate1904 = false) {
  return { date1904: isDate1904, dateSanityRange: DEFAULT_SETTINGS.dateSanityRange };
}

function codes(text: string): string[] {
  return parseDate(textCell(text), options()).issues.map((issue) => issue.code);
}

it('7月30日没有年份，值为空，不在解析时补年', () => {
  const parsed = parseDate(textCell('7月30日'), options());
  expect(parsed.value).toBeNull();
  expect(parsed.raw).toBe('7月30日');
  expect(parsed.missingReason).toBe('unparseable');
  expect(parsed.issues.map((issue) => issue.code)).toEqual(['DATE_NO_YEAR']);
  expect(parsed.issues[0]?.severity).toBe('warning');
  expect(parseDate(textCell('2月29日'), options()).issues.map((issue) => issue.code)).toEqual(['DATE_NO_YEAR']);
});

it('像日期但不合法的文本置空，报 DATE_INVALID', () => {
  for (const text of ['20206/7/29', '20267/18', '2026/7/16-1', '6/18-', '2026/2/31', '2026年7月16日', '2月31日', '4月31日']) {
    const parsed = parseDate(textCell(text), options());
    expect(parsed.value, text).toBeNull();
    expect(parsed.issues.map((issue) => issue.code), text).toEqual(['DATE_INVALID']);
    expect(parsed.raw, text).toBe(text);
  }
});

it('不生产、客户自提、6月份、预计9/10 是文字，不是残缺日期', () => {
  for (const text of ['不生产', '客户自提', '6月份', '预计9/10']) {
    expect(codes(text), text).toEqual(['DATE_TEXT']);
    expect(parseDate(textCell(text), options()).value, text).toBeNull();
  }
});

it('斜杠日期格是未填写，不报问题码', () => {
  const parsed = parseDate(textCell('/'), options());
  expect(parsed.value).toBeNull();
  expect(parsed.issues).toEqual([]);
  expect(parsed.missingReason).toBe('not_provided');
});

it('年月日三种分隔符和 8 位数字都能解析，并补成两位月日', () => {
  expect(parseDate(textCell('2026/7/16'), options()).value).toBe(day('2026-07-16'));
  expect(parseDate(textCell('2026-7-16'), options()).value).toBe(day('2026-07-16'));
  expect(parseDate(textCell('2026.7.16'), options()).value).toBe(day('2026-07-16'));
  expect(parseDate(textCell('20260919'), options()).value).toBe(day('2026-09-19'));
  expect(codes('2026/7/16')).toEqual([]);
});

it('序列号 46284 是 2026-09-19，小数部分丢掉', () => {
  expect(parseDate(numberCell(46284), options()).value).toBe(day('2026-09-19'));
  const fractional = parseDate(numberCell(46284.75), options());
  expect(fractional.value).toBe(day('2026-09-19'));
  expect(fractional.raw).toBe('46284.75');
  expect(fractional.issues).toEqual([]);
});

it('序列号 37093 换算出范围外的日期，值为空，原文保留', () => {
  expect(excelSerialToLocalDate(37093) < '2020-01-01').toBe(true);
  const parsed = parseDate(numberCell(37093), options());
  expect(parsed.value).toBeNull();
  expect(parsed.raw).toBe('37093');
  expect(parsed.issues.map((issue) => issue.code)).toEqual(['DATE_OUT_OF_RANGE']);
});

it('默认范围含两端，范围外置空', () => {
  expect(parseDate(textCell('2020/1/1'), options()).value).toBe(day('2020-01-01'));
  expect(parseDate(textCell('2030/12/31'), options()).value).toBe(day('2030-12-31'));
  expect(codes('2019/12/31')).toEqual(['DATE_OUT_OF_RANGE']);
  expect(codes('2031/1/1')).toEqual(['DATE_OUT_OF_RANGE']);
});

it('数字日期跟着工作簿的 1904 日期系统走', () => {
  const wide = { from: day('1900-01-01'), to: day('2100-12-31') };
  const parsed = parseDate(numberCell(1000), { date1904: true, dateSanityRange: wide });
  expect(parsed.value).toBe(excelSerialToLocalDate(1000, true));
});

it('日期格里的公式错误值报 FORMULA_ERROR，公式缓存值另记一笔', () => {
  expect(parseDate(textCell('#VALUE!'), options()).issues.map((issue) => issue.code)).toEqual(['FORMULA_ERROR']);
  const cached = parseDate(numberCell(46284, '=A1'), options());
  expect(cached.value).toBe(day('2026-09-19'));
  expect(cached.issues.map((issue) => issue.code)).toEqual(['FORMULA_VALUE']);
});
