import { expect, it } from 'vitest';
import { templateIdLabel } from '../../packages/domain/src/index.js';
import { readCsv } from '../../packages/importers/src/workbook/index.js';
import { templates } from '../../packages/importers/src/registry.js';
import type { WorkbookLike } from '../../packages/application/src/ports/workbook-reader.js';
import { template } from '../../packages/importers/src/templates/owner-map-v1/index.js';

const context = { uploadedAt: '2026-11-09T00:00:00.000Z', factoryPartyId: null };
const HEADER = ['采购订单号', '负责人'] as const;

it('识别负责人映射表头，别的模板文件分为 0', () => {
  expect(templateIdLabel('owner-map-v1')).toBe('负责人映射');
  expect(templates.some((item) => item.id === 'owner-map-v1')).toBe(true);
  expect(template.detect(bookOf([HEADER, ['PO202610120001', '采购甲']]))).toEqual({ score: 100, reasons: ['负责人映射表头齐全'] });
  expect(template.detect(bookOf([['产品条码', '产品名称']]))).toEqual({ score: 0, reasons: ['第一行不是负责人映射表头'] });
  expect(template.detect(bookOf([[' 采购订单号 ', ' 负责人 ']])).score).toBe(100);
});

it('解析出订单号原文和负责人原文，同一文件解析两次相同', () => {
  const book = bookOf([HEADER, ['PO20261012000001', ' 采购甲 '], ['PO20261012000002', '采购乙']]);
  const first = template.parse(book, context);
  expect(first.template).toBe('owner-map-v1');
  expect(first.rows.map((row) => ({ rowNo: row.rowNo, payload: row.payload }))).toEqual([
    { rowNo: 2, payload: { poRaw: 'PO20261012000001', ownerNameRaw: '采购甲' } },
    { rowNo: 3, payload: { poRaw: 'PO20261012000002', ownerNameRaw: '采购乙' } },
  ]);
  expect(first.rows.flatMap((row) => row.issues)).toEqual([]);
  expect(template.parse(book, context)).toEqual(first);
});

it('负责人为空、订单号为空或占位都标 error 并跳过，不写假负责人', () => {
  const parsed = template.parse(bookOf([HEADER, ['PO202610120001', ''], ['', '采购甲'], ['不下单', '采购甲']]), context);
  expect(issueCodesOf(parsed.rows[0])).toContain('OWNER_NAME_MISSING');
  expect(parsed.rows[0]?.skipReason).toBe('OWNER_NAME_MISSING');
  expect(parsed.rows[0]?.action).toBe('skip');
  expect(issueCodesOf(parsed.rows[1])).toContain('ROW_NO_IDENTITY');
  expect(parsed.rows[1]?.skipReason).toBe('ROW_NO_IDENTITY');
  expect(issueCodesOf(parsed.rows[2])).toContain('PO_PLACEHOLDER');
  expect(parsed.rows[2]?.skipReason).toBe('ROW_NO_IDENTITY');
});

it('认不出格式的订单号只警告，仍然可以提交去精确匹配', () => {
  const parsed = template.parse(bookOf([HEADER, ['ABC-2026-1', '采购甲']]), context);
  const row = parsed.rows[0];
  expect(row?.issues.map((issue) => issue.code)).toEqual(['PO_UNKNOWN_FORMAT']);
  expect(row?.skipReason).toBeNull();
  expect(row?.payload).toEqual({ poRaw: 'ABC-2026-1', ownerNameRaw: '采购甲' });
});

it('中间重复表头标 skip，空行不进入 rows', () => {
  const parsed = template.parse(bookOf([HEADER, ['PO202610120001', '采购甲'], ['', ''], HEADER, ['PO202610120002', '采购乙']]), context);
  expect(parsed.rows.map((row) => row.rowNo)).toEqual([2, 4, 5]);
  expect(issueCodesOf(parsed.rows[1])).toEqual(['ROW_REPEATED_HEADER']);
  expect(parsed.rows[1]?.skipReason).toBe('ROW_REPEATED_HEADER');
});

it('表头不对时给一条 HEADER_NOT_FOUND skip 行，不假装解析成功', () => {
  const parsed = template.parse(bookOf([['采购订单号', '采购人'], ['PO202610120001', '采购甲']]), context);
  expect(parsed.rows).toHaveLength(1);
  expect(issueCodesOf(parsed.rows[0])).toContain('HEADER_NOT_FOUND');
  expect(parsed.rows[0]?.skipReason).toBe('HEADER_NOT_FOUND');
});

it('diff 只把有 error 的行标 skip，其它行让提交执行器处理', () => {
  const parsed = template.parse(bookOf([HEADER, ['PO202610120001', '采购甲'], ['PO202610120002', '']]), context);
  const diffed = template.diff(parsed, { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] });
  expect(diffed.rows.map((row) => row.action)).toEqual(['create', 'skip']);
});

function issueCodesOf(row: { readonly issues: readonly { readonly code: string }[] } | undefined): readonly string[] {
  return row === undefined ? [] : row.issues.map((issue) => issue.code);
}

function bookOf(lines: readonly (readonly string[])[]): WorkbookLike {
  return readCsv(new TextEncoder().encode(lines.map((line) => line.join(',')).join('\n')), 'owner-map.csv');
}
