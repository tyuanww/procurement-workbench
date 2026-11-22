import { expect, it } from 'vitest';
import { parsePoCell } from '../../packages/domain/src/index.js';

function codes(raw: string): string[] {
  return parsePoCell(raw).issues.map((issue) => issue.code);
}

it('一格两个单号中间是换行：第一个是主单号，报 PO_MULTI', () => {
  const parsed = parsePoCell('PO2099007003\nPO2099007004');
  expect(parsed.value).toEqual({
    poNorm: 'PO2099007003',
    poFormat: 'PO10',
    relatedPoRaws: ['PO2099007004'],
    extraText: null,
  });
  expect(parsed.issues.map((issue) => issue.code)).toEqual(['PO_MULTI']);
});

it('不下单和斜杠是占位，单号为空，不改写成别的格式', () => {
  for (const raw of ['不下单', '/', '／', '—']) {
    const parsed = parsePoCell(raw);
    expect(parsed.value.poFormat).toBe('NONE');
    expect(parsed.value.poNorm).toBeNull();
    expect(parsed.missingReason).toBe('not_provided');
    expect(parsed.issues.map((issue) => issue.code)).toEqual(['PO_PLACEHOLDER']);
  }
});

it('空单号是没有单号，不报占位', () => {
  const parsed = parsePoCell('  ');
  expect(parsed.value.poFormat).toBe('NONE');
  expect(parsed.value.poNorm).toBeNull();
  expect(parsed.issues).toEqual([]);
  expect(parsed.missingReason).toBe('not_provided');
});

it('单号后面的（1）原样保留，报 PO_EXTRA_TEXT', () => {
  const parsed = parsePoCell('PO2025170031（1）');
  expect(parsed.value.poNorm).toBe('PO2025170031');
  expect(parsed.value.poFormat).toBe('PO10');
  expect(parsed.value.extraText).toBe('（1）');
  expect(parsed.issues.map((issue) => issue.code)).toEqual(['PO_EXTRA_TEXT']);
  expect(parsed.issues[0]?.raw).toBe('（1）');
});

it('位数不够的 PO202070029 认不出，格式是 OTHER，原文不改', () => {
  const parsed = parsePoCell('PO202070029');
  expect(parsed.value.poFormat).toBe('OTHER');
  expect(parsed.value.poNorm).toBe('PO202070029');
  expect(codes('PO202070029')).toEqual(['PO_UNKNOWN_FORMAT']);
});

it('P0 开头不改成 PO，报 PO_P0_PREFIX', () => {
  const parsed = parsePoCell('P02024700028');
  expect(parsed.value.poNorm).toBe('P02024700028');
  expect(parsed.value.poFormat).toBe('P0_10');
  expect(codes('P02024700028')).toEqual(['PO_P0_PREFIX']);
});

it('HZSY 和 3500 按各自格式识别，不和 PO 互认', () => {
  expect(parsePoCell('HZSY-20237025').value).toEqual({
    poNorm: 'HZSY-20237025',
    poFormat: 'HZSY',
    relatedPoRaws: [],
    extraText: null,
  });
  expect(codes('HZSY-20237025')).toEqual([]);
  expect(parsePoCell('3500-202609700002').value).toMatchObject({
    poNorm: '3500-202609700002',
    poFormat: 'PUR3500',
  });
  expect(codes('3500-202609700002')).toEqual([]);
});

it('SY 不被 HZSY 的前缀吃掉，14 位和 3505 也能认出', () => {
  expect(parsePoCell('SY-20230801').value.poFormat).toBe('SY');
  expect(parsePoCell(`PO${'1'.repeat(14)}`).value.poFormat).toBe('PO14');
  expect(parsePoCell(`P0${'2'.repeat(14)}`).value.poFormat).toBe('P0_14');
  expect(parsePoCell(`3505-${'3'.repeat(12)}`).value.poFormat).toBe('PUR3505');
});

it('同一格先出现的单号是主单号，P0 和额外文字可以同时报', () => {
  const mixed = parsePoCell('HZSY-20237025 PO2025170030');
  expect(mixed.value.poFormat).toBe('HZSY');
  expect(mixed.value.relatedPoRaws).toEqual(['PO2025170030']);
  expect(mixed.issues.map((issue) => issue.code)).toEqual(['PO_MULTI']);

  const marked = parsePoCell('P02024700028（1）');
  expect(marked.value.poNorm).toBe('P02024700028');
  expect(marked.value.extraText).toBe('（1）');
  expect(marked.issues.map((issue) => issue.code)).toEqual(['PO_EXTRA_TEXT', 'PO_P0_PREFIX']);
});

it('多单号后面的已塞膜留下来，小写单号规范化成大写', () => {
  const first = 'PO2099007001';
  const second = 'PO2099007002';
  const parsed = parsePoCell(`${first}\n${second}已塞膜`);
  expect(parsed.value.poNorm).toBe(first);
  expect(parsed.value.relatedPoRaws).toEqual([second]);
  expect(parsed.value.extraText).toBe('已塞膜');
  expect(parsed.issues.map((issue) => issue.code)).toEqual(['PO_MULTI', 'PO_EXTRA_TEXT']);
  expect(parsePoCell(first.toLowerCase()).value.poNorm).toBe(first);
  expect(parsePoCell(`${first}\n${second.toLowerCase()}`).value.relatedPoRaws).toEqual([second.toLowerCase()]);
  expect(parsePoCell('ＰＯ２０９９００７００１').value.poNorm).toBe(first);
});
