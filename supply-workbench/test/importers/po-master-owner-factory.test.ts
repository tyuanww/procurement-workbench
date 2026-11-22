import { expect, it } from 'vitest';
import { readCsv } from '../../packages/importers/src/workbook/index.js';
import { REQUIRED_COLUMNS } from '../../packages/importers/src/templates/po-master-v1/columns.js';
import { template } from '../../packages/importers/src/templates/po-master-v1/index.js';
import type { WorkbookLike } from '../../packages/application/src/ports/workbook-reader.js';

const context = { uploadedAt: '2026-11-09T00:00:00.000Z', factoryPartyId: null };

const base: Readonly<Record<string, string>> = {
  供应商: '甲代工厂',
  产品名称: '海葡萄水光冰冰贴',
  产品条码: '2000000003023',
  订单数量: '10',
  采购订单号: 'PO-2026-1',
  状态: '进行中',
};

it('可选列采购负责人和工厂被识别，不算多余列', () => {
  const book = bookOf([...REQUIRED_COLUMNS, '采购负责人', '工厂'], { ...base, 采购负责人: '采购甲', 工厂: '甲代工厂' });
  const detected = template.detect(book);
  expect(detected.score).toBe(100);
  expect(detected.reasons).toContain('识别可选列 采购负责人');
  expect(detected.reasons).toContain('识别可选列 工厂');
  expect(detected.reasons.some((reason) => reason.includes('忽略多余列'))).toBe(false);
  const row = template.parse(book, context).rows[0];
  expect(row?.payload.ownerRaw).toEqual({ raw: '采购甲', value: '采购甲' });
  expect(row?.payload.factoryRaw).toEqual({ raw: '甲代工厂', value: '甲代工厂' });
});

it('没有可选列时值为 null，不影响 17 列识别', () => {
  const book = bookOf([...REQUIRED_COLUMNS], base);
  expect(template.detect(book).score).toBe(100);
  const row = template.parse(book, context).rows[0];
  expect(row?.payload.ownerRaw).toEqual({ raw: null, value: null });
  expect(row?.payload.factoryRaw).toEqual({ raw: null, value: null });
});

it('可选列空值和占位符按未填写处理', () => {
  const book = bookOf([...REQUIRED_COLUMNS, '采购负责人', '工厂'], { ...base, 采购负责人: '  ', 工厂: '-' });
  const row = template.parse(book, context).rows[0];
  expect(row?.payload.ownerRaw?.value).toBeNull();
  expect(row?.payload.factoryRaw?.value).toBeNull();
});

it('不认识的列仍算多余列，不影响识别', () => {
  const book = bookOf([...REQUIRED_COLUMNS, '备注'], { ...base, 备注: '现场备注' });
  expect(template.detect(book).reasons).toContain('忽略多余列 备注');
  expect(template.parse(book, context).rows).toHaveLength(1);
});

function bookOf(headers: readonly string[], row: Readonly<Record<string, string>>): WorkbookLike {
  const text = [headers.join(','), headers.map((header) => row[header] ?? '').join(',')].join('\n');
  return readCsv(new TextEncoder().encode(text), 'po-master-optional.csv');
}
