import { expect, it } from 'vitest';
import { parseBarcode, parseItemCode } from '../../packages/domain/src/index.js';

const bom = { isBomPartColumn: true };

function codesOf(raw: string, context = { isBomPartColumn: false }): string[] {
  return parseItemCode(raw, context).issues.map((issue) => issue.code);
}

it('k1496 规范成大写并报 CODE_CASE，已经是大写的不报', () => {
  const parsed = parseItemCode('k1496');
  expect(parsed.value).toEqual({ codeType: 'raw_k', codeNorm: 'K1496' });
  expect(codesOf('k1496')).toEqual(['CODE_CASE']);
  expect(parseItemCode('K1497').value).toEqual({ codeType: 'raw_k', codeNorm: 'K1497' });
  expect(codesOf('K1497')).toEqual([]);
});

it('品号、包材码、半成品码按格式识别', () => {
  expect(parseItemCode('70007019').value).toEqual({ codeType: 'erp_70', codeNorm: '70007019' });
  expect(parseItemCode('30000001').value).toEqual({ codeType: 'pack_30', codeNorm: '30000001' });
  expect(parseItemCode('50007003').value).toEqual({ codeType: 'semi_50', codeNorm: '50007003' });
  expect(parseItemCode('50007004').value).toEqual({ codeType: 'semi_50', codeNorm: '50007004' });
});

it('13 位和带 -数字 后缀的条码原文保留后缀', () => {
  expect(parseBarcode('2000000003023').value).toBe('2000000003023');
  expect(parseBarcode('2000000003023').issues).toEqual([]);
  const suffixed = parseBarcode('2000000003016-1');
  expect(suffixed.value).toBe('2000000003016-1');
  expect(suffixed.issues.map((issue) => issue.code)).toEqual(['BARCODE_SUFFIX']);
  expect(parseItemCode('2000000003016-1').value).toEqual({
    codeType: 'barcode_69',
    codeNorm: '2000000003016-1',
  });
});

it('10 位条码照收，报 BARCODE_LENGTH', () => {
  const parsed = parseBarcode('1234567890');
  expect(parsed.value).toBe('1234567890');
  expect(parsed.issues.map((issue) => issue.code)).toEqual(['BARCODE_LENGTH']);
  expect(parsed.issues[0]?.severity).toBe('warning');
});

it('11 位 BOM 子件码只在子件条码列里是 bom_part，其他列认不出', () => {
  const part = parseItemCode('15112610221', bom);
  expect(part.value).toEqual({ codeType: 'bom_part', codeNorm: '15112610221' });
  expect(part.issues).toEqual([]);
  expect(parseItemCode('1511811051', bom).value?.codeType).toBe('bom_part');
  const elsewhere = parseItemCode('15112610221');
  expect(elsewhere.value).toEqual({ codeType: 'other', codeNorm: '15112610221' });
  expect(elsewhere.issues.map((issue) => issue.code)).toEqual(['CODE_UNKNOWN_PATTERN']);
});

it('BOM 列里长度不对仍是 bom_part，报 BARCODE_LENGTH', () => {
  const parsed = parseItemCode('15118', bom);
  expect(parsed.value?.codeType).toBe('bom_part');
  expect(parsed.issues.map((issue) => issue.code)).toEqual(['BARCODE_LENGTH']);
});

it('认不出的编码类型是 other，照样留下，不置空', () => {
  const parsed = parseItemCode('ABC-9');
  expect(parsed.value).toEqual({ codeType: 'other', codeNorm: 'ABC-9' });
  expect(parsed.issues.map((issue) => issue.code)).toEqual(['CODE_UNKNOWN_PATTERN']);
  expect(parsed.missingReason).toBeUndefined();
});

it('编码和条码的斜杠是未填写，不报问题码', () => {
  expect(parseItemCode('/').value).toBeNull();
  expect(parseItemCode('/').issues).toEqual([]);
  expect(parseItemCode('/').missingReason).toBe('not_provided');
  expect(parseBarcode('  ').value).toBeNull();
  expect(parseBarcode('-').issues).toEqual([]);
});
