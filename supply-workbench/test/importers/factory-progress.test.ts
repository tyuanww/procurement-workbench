import { expect, it } from 'vitest';
import { template } from '../../packages/importers/src/templates/factory-progress-v1/index.js';
import { describeImportTemplateContract } from '../../packages/testkit/src/contracts/import-template.js';
import { factoryBook, factoryContext } from './fixtures/factory-progress.js';
import { foreignBook } from './fixtures/workbooks.js';

const parsed = template.parse(factoryBook, factoryContext);
const emptyExisting = { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] };

it('识别工厂进度的必需表并忽略说明', () => {
  expect(template.detect(factoryBook).score).toBe(100);
  expect(parsed).toMatchObject({
    coverage: 'full_snapshot', candidateKeyVersion: 'factory-progress-v1', ignoredSheets: ['其他说明'], fileIssues: [],
  });
  expect(template.parse(foreignBook, factoryContext).fileIssues.map((issue) => issue.code)).toEqual([
    'HEADER_NOT_FOUND', 'HEADER_NOT_FOUND', 'HEADER_NOT_FOUND',
  ]);
});

it('在途规范化单号和日期，生成条码品号对照并提醒工厂不一致', () => {
  expect(parsed.inTransit).toMatchObject([
    { payload: { po: { value: { poFormat: 'PO14' } }, orderedOn: { value: '2026-09-19' }, itemCodeRaw: { value: '70000001' } } },
    { issues: expect.arrayContaining([expect.objectContaining({ code: 'FACTORY_MISMATCH', column: '供应商' })]) },
  ]);
  expect(parsed.codeLinks).toMatchObject([{ fromCodeRaw: '6900000000001', toCodeRaw: '70000001', rowNo: 2 }]);
});

it('缺少明细支持的派生零值留空，有明细的零值保留', () => {
  expect(parsed.inTransit).toMatchObject([
    { payload: { qtyDeliveredFactory: { value: 0 }, qtyFactoryStock: { value: 0 } } },
    { payload: { qtyDeliveredFactory: { value: null }, qtyFactoryStock: { value: null } } },
  ]);
  const derivedIssues = parsed.inTransit.flatMap((row) => row.issues.filter((issue) => issue.code === 'DERIVED_ZERO_NO_SOURCE'));
  expect(derivedIssues.map((issue) => issue.column)).toEqual(['已交货数量', '工厂现货库存数量']);
});

it('出货读取合并单号并保留文字日期问题，库存略过仅有验货标记的行', () => {
  expect(parsed.shipments[1]).toMatchObject({
    payload: { po: { value: { poNorm: 'PO20260101000001' } }, shipOrArriveOn: { raw: '客户自提', value: null } },
    issues: expect.arrayContaining([expect.objectContaining({ code: 'MERGED_FILL' }), expect.objectContaining({ code: 'DATE_TEXT' })]),
  });
  expect(parsed.stock).toMatchObject([
    { payload: { inspected: true }, skipReason: null },
    { skipReason: 'ROW_EMPTY_LIKE' },
  ]);
});

it('比对按内容指纹匹配，不把同一位置的变化判为不变', () => {
  const row = parsed.inTransit[0];
  if (row?.fingerprint === undefined) throw new Error('需要一条带指纹的在途记录');
  const diffByPosition = template.diff(parsed, { ...emptyExisting, factoryFingerprints: [`${row.sheetName}:${row.rowNo}`] });
  expect(diffByPosition.inTransit[0]?.action).toBe('create');
  const diffByContent = template.diff(parsed, { ...emptyExisting, factoryFingerprints: [row.fingerprint] });
  expect(diffByContent.inTransit.map((item) => item.action)).toEqual(['unchanged', 'create']);
  expect(diffByContent.stock.map((item) => item.action)).toEqual(['create', 'skip']);
});

describeImportTemplateContract(template, { ownFile: factoryBook, foreignFile: foreignBook });
