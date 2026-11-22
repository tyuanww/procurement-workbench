import { expect, it } from 'vitest';
import type { ImportExisting, ParsedRow, PoMasterPayload } from '../../packages/application/src/ports/parsed-rows.js';
import { readCsv } from '../../packages/importers/src/workbook/index.js';
import { candidateKeys, fillNoYear, importYear, pendingIdentities, template } from '../../packages/importers/src/templates/po-master-v1/index.js';
import { describeImportTemplateContract } from '../../packages/testkit/src/contracts/import-template.js';
import { foreignBook, poCsv } from './fixtures/workbooks.js';

const uploadedAt = '2026-10-12T00:00:00.000Z';
const book = readCsv(poCsv([
  { 供应商: '示例工厂甲', 产品名称: '示例面霜', 产品条码: '6900000000001', 采购订单号: 'PO20260101000001', 订单数量: '100', 订单首批交付时间: '7月2日', 状态: '进行中' },
  { 供应商: '示例工厂乙', 产品名称: '示例精华', 产品条码: '6900000000002-2', 采购订单号: 'P02026010002', 订单数量: '200', '实际结束（成品交付完成）': '8月3日', 状态: '已完成' },
  { 状态: '未开始' },
]), 'po-master.csv');
const parsed = template.parse(book, { uploadedAt, factoryPartyId: null });
const emptyExisting: ImportExisting = { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] };

it('总表标明快照口径，保留规范化单号、渠道条码和待审核供应商', () => {
  expect(parsed).toMatchObject({ coverage: 'full_snapshot', candidateKeyVersion: 'po-master-v1' });
  expect(parsed.rows.map((row) => row.payload.po.value?.poFormat)).toEqual(['PO14', 'P0_10', undefined]);
  expect(parsed.rows[1]?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'BARCODE_SUFFIX' })]));
  expect(pendingIdentities(parsed.rows).aliases).toHaveLength(2);
});

it('空库比对全部新建，同一结果再比对全部不变', () => {
  const first = template.diff(parsed, emptyExisting);
  expect(first.rows.filter((row) => row.action === 'create')).toHaveLength(2);
  expect(first.rows.filter((row) => row.action === 'skip')).toHaveLength(1);
  const replay = template.diff(parsed, {
    ...emptyExisting,
    poMaster: parsed.rows.flatMap((row) => {
      const key = candidateKeys(parsed.rows).get(row.rowNo);
      return key === undefined ? [] : [{ candidateKey: key, values: row.payload }];
    }),
  });
  expect(replay.rows.filter((row) => row.action === 'unchanged')).toHaveLength(2);
  expect(replay.rows.filter((row) => row.action === 'create')).toHaveLength(0);
});

it('快照字段变化是 update，同一个键对上多行是 conflict', () => {
  const row = parsed.rows.find((item) => item.skipReason === null);
  const key = row === undefined ? undefined : candidateKeys(parsed.rows).get(row.rowNo);
  if (row === undefined || key === undefined) throw new Error('样例里没有可导入的行');
  const changed = { ...row.payload, qtyOrdered: { raw: '1', value: 1 } };
  const updated = template.diff(parsed, { ...emptyExisting, poMaster: [{ candidateKey: key, values: changed }] });
  expect(updated.rows.find((item) => item.rowNo === row.rowNo)?.action).toBe('update');
  const conflicted = template.diff(parsed, { ...emptyExisting, poMaster: [{ candidateKey: key, values: row.payload }, { candidateKey: key, values: row.payload }] });
  expect(conflicted.rows.find((item) => item.rowNo === row.rowNo)?.action).toBe('conflict');
  expect(conflicted.rows.find((item) => item.rowNo === row.rowNo)?.issues.some((issue) => issue.code === 'KEY_AMBIGUOUS_EXISTING')).toBe(true);
});

it('CSV 没有文件时间时，按上传年份补无年份日期，问题降为 info', () => {
  expect(book.source.modifiedAt).toBeUndefined();
  const year = importYear(book, uploadedAt);
  expect(year).toBe(2026);
  if (year === null) return;
  const filled = fillNoYear(parsed, year);
  const hits = filled.rows.flatMap((row) => row.issues.filter((issue) => issue.code === 'DATE_NO_YEAR').map((issue) => filledDate(row, issue)));
  expect(hits).toEqual([
    '订单首批交付时间:7月2日=2026-07-02:info',
    '实际结束（成品交付完成）:8月3日=2026-08-03:info',
  ]);
});

function filledDate(row: ParsedRow<PoMasterPayload>, issue: { readonly column: string | null; readonly raw: string | null; readonly severity: string }): string {
  const value = issue.column === '订单首批交付时间' ? row.payload.firstDeliveryOn.value : row.payload.actualEndOn.value;
  return `${issue.column}:${issue.raw}=${value}:${issue.severity}`;
}

it('有文件时间时补年不用上传时间', () => {
  expect(importYear({ ...book, source: { ...book.source, modifiedAt: '2025-09-21T15:55:33Z' } }, uploadedAt)).toBe(2025);
});

it('缺列识别分为 0，并报 HEADER_NOT_FOUND；多余列仍识别', () => {
  const missing = readCsv(new TextEncoder().encode('供应商,产品名称\n示例工厂,面膜\n'), 'missing.csv');
  expect(template.detect(missing).score).toBe(0);
  expect(template.parse(missing, { uploadedAt, factoryPartyId: null }).rows[0]?.issues[0]?.code).toBe('HEADER_NOT_FOUND');
  const extra = readCsv(new TextEncoder().encode(`${quotedHeader()},备注\n`), 'extra.csv');
  expect(template.detect(extra).score).toBe(100);
  expect(template.detect(extra).reasons).toContain('忽略多余列 备注');
});

function quotedHeader(): string {
  const sheet = book.sheets[0];
  if (sheet === undefined) return '';
  const names: string[] = [];
  for (let col = 1; col <= 17; col += 1) names.push(`"${sheet.cell(1, col)?.text ?? ''}"`);
  return names.join(',');
}

describeImportTemplateContract(template, {
  ownFile: book,
  foreignFile: foreignBook,
});
