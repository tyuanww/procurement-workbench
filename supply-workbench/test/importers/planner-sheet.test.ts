import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { entityId, templateIdLabel, type ImportBatch } from '../../packages/domain/src/index.js';
import { importRowsOf } from '../../packages/application/src/imports/use-cases/parse-batch.js';
import { commitPlannerSheet } from '../../packages/application/src/imports/commit/planner-sheet-v1.js';
import { continuationOf } from '../../apps/web/src/features/imports/model/flow.js';
import { readCsv } from '../../packages/importers/src/workbook/index.js';
import { templates } from '../../packages/importers/src/registry.js';
import { template } from '../../packages/importers/src/templates/planner-sheet-v1/index.js';
import { anActor, createMemory, describeImportTemplateContract } from '../../packages/testkit/src/index.js';
import type { WorkbookLike } from '../../packages/application/src/ports/workbook-reader.js';

import { PLANNER_SHEET_COLUMNS } from '../../packages/importers/src/templates/planner-sheet-v1/columns.js';
import { template as factoryTemplate } from '../../packages/importers/src/templates/factory-progress-v1/index.js';
import { REQUIRED_SHEET_TITLES } from '../../packages/importers/src/templates/factory-progress-v1/spec/index.js';
import { foreignBook, sheet as makeSheet, workbook } from './fixtures/workbooks.js';

const root = path.resolve(import.meta.dirname, '../..');
const AT = '2026-11-10T00:00:00.000Z';
const context = { uploadedAt: AT, factoryPartyId: null };
const actor = anActor('buyer');
const plannerSheet = makeSheet({
  name: '示例排产作业表',
  rows: [
    ['示例'],
    PLANNER_SHEET_COLUMNS,
    ['2026-06-09', 'PO20260101000001', '示例面膜', '70000001', '20万', '示例组合', '70000002', '/', { kind: 'string', value: '待发货', text: '待发货', formula: 'IF(TRUE,"待发货","")' }],
    ['2026-06-09', 'PO20260101000001', '示例面膜补量', '70000001', null, '示例组合', '70000002', '/', ''],
  ],
  merges: [{ r1: 3, c1: 5, r2: 4, c2: 5 }],
});
const sheet = workbook([plannerSheet]);
const factoryBook = workbook([...REQUIRED_SHEET_TITLES.map((name) => makeSheet({ name, rows: [] })), plannerSheet]);
const foreign = foreignBook;

describeImportTemplateContract(template, { ownFile: sheet, foreignFile: foreign });

it('单独的排产作业表能识别，整本代工厂进度不抢走', () => {
  expect(templateIdLabel('planner-sheet-v1')).toBe('排产作业表');
  expect(templates.some((item) => item.id === 'planner-sheet-v1')).toBe(true);
  expect(template.detect(sheet)).toEqual({ score: 100, reasons: ['排产作业表表头齐全'] });
  expect(template.detect(factoryBook)).toEqual({ score: 0, reasons: ['整本含代工厂进度必需表，仍归代工厂进度'] });
  expect(template.detect(withoutSheet(factoryBook, '在途订单汇总'))).toEqual({ score: 0, reasons: ['整本含代工厂进度必需表，仍归代工厂进度'] });
  expect(template.detect(foreign).score).toBe(0);
});

it('读出订单、两个品号和按万换算的排产数量', () => {
  const parsed = template.parse(sheet, context);
  expect(rowOf(parsed.rows, 3)).toMatchObject({
    sheetName: plannerSheet.name,
    skipReason: null,
    payload: {
      scheduledOn: { value: '2026-06-09' },
      poRaw: 'PO20260101000001',
      poNorm: 'PO20260101000001',
      nameRaw: '示例面膜',
      orderItemCodeRaw: '70000001',
      productionItemCodeRaw: '70000002',
      qtyRequired: { raw: '20万', value: 200000 },
    },
  });
});

it('合并的排产数量标出来源，品名不同的两行各自保留', () => {
  const parsed = template.parse(sheet, context);
  expect(rowOf(parsed.rows, 4)).toMatchObject({
    payload: { nameRaw: '示例面膜补量', qtyRequired: { value: 200000 } },
    issues: expect.arrayContaining([expect.objectContaining({ code: 'MERGED_FILL', column: '要求排产' })]),
  });
  expect(parsed.rows.flatMap((row) => row.issues.map((issue) => issue.code))).not.toContain('KEY_DUPLICATE_IN_FILE');
});

it('公式缓存的备注保留缓存值，并标 FORMULA_VALUE', () => {
  expect(noteOf(template.parse(sheet, context).rows, 3)).toEqual({ note: '待发货', formula: true });
});

it('整本代工厂进度保留同一张排产作业表供显式解析', () => {
  expect(template.parse(factoryBook, context).rows).toEqual(template.parse(sheet, context).rows);
  expect(factoryTemplate.parse(factoryBook, context).ignoredSheets).toEqual([plannerSheet.name]);
});

it('内容指纹相同的行再比对是不变', () => {
  const parsed = template.parse(sheet, context);
  const target = parsed.rows.find((row) => row.rowNo === 3 && row.skipReason === null);
  if (target === undefined) throw new Error('没有第 3 行');
  const fingerprint = template.identityOf(parsed).find((item) => item.rowNo === target.rowNo)?.fingerprint;
  if (fingerprint === undefined) throw new Error('没有第 3 行身份');
  const diffed = template.diff(parsed, { poMaster: [], factoryFingerprints: [fingerprint], products: [], bomKeys: [] });
  expect(diffed.rows.find((row) => row.rowNo === target.rowNo)?.action).toBe('unchanged');
});

it('只有 sheet:rowNo 时，同一位置内容变化判新建，重复表头和没有身份的行仍跳过', () => {
  const parsed = template.parse(sheet, context);
  const target = parsed.rows.find((row) => row.rowNo === 3 && row.skipReason === null);
  if (target === undefined) throw new Error('没有第 3 行');
  const index = parsed.rows.indexOf(target);
  const known = [`${target.sheetName}:${target.rowNo}`];
  const diffed = template.diff(parsed, { poMaster: [], factoryFingerprints: known, products: [], bomKeys: [] });
  expect(diffed.rows[index]?.action).toBe('create');
  const broken = template.diff(template.parse(brokenBook(), context), { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] });
  expect(broken.rows.map((row) => ({ rowNo: row.rowNo, action: row.action, skipReason: row.skipReason }))).toEqual([
    { rowNo: 2, action: 'create', skipReason: null },
    { rowNo: 3, action: 'skip', skipReason: 'ROW_REPEATED_HEADER' },
    { rowNo: 4, action: 'skip', skipReason: 'ROW_NO_IDENTITY' },
  ]);
});

it('提交不写订单或排期，同一批再交一次结果相同', async () => {
  const memory = createMemory();
  const before = structuredClone(memory.box.current);
  const rows = importRowsOf({
    batchId: entityId('planner-batch'),
    parsed: template.diff(template.parse(sheet, context), { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] }),
    ids: rowIds(),
  });
  const first = await commitPlannerSheet({ tx: memory.stores, batch: batchOf(), rows, at: AT, actor });
  const second = await commitPlannerSheet({ tx: memory.stores, batch: batchOf(), rows, at: AT, actor });
  expect(first).toEqual({ affectedLineIds: [], presentLineIds: [] });
  expect(second).toEqual(first);
  expect(memory.box.current).toEqual(before);
});

it('提交读不懂的非跳过行会失败，不把坏行当成成功', async () => {
  const memory = createMemory();
  const rows = importRowsOf({
    batchId: entityId('planner-batch'),
    parsed: template.diff(template.parse(sheet, context), { poMaster: [], factoryFingerprints: [], products: [], bomKeys: [] }),
    ids: rowIds(),
  });
  const broken = rows.map((row, index) => (index === 0 && row.action !== 'skip' ? { ...row, parsed: { poRaw: 1 } } : row));
  await expect(commitPlannerSheet({ tx: memory.stores, batch: batchOf(), rows: broken, at: AT, actor })).rejects.toThrow('排产作业表行无法读取');
});

it('flow 和 testkit 清单不出现这个模板 id，其它模板目录也不出现', () => {
  expect(read('apps/web/src/features/imports/model/flow.ts')).not.toContain('planner-sheet-v1');
  expect(read('packages/testkit/src/contracts/import-template.ts')).not.toContain('planner-sheet-v1');
  for (const id of ['po-master-v1', 'factory-progress-v1', 'product-archive-v1', 'bom-v1', 'owner-map-v1']) {
    expect(read(`packages/importers/src/templates/${id}/index.ts`)).not.toContain('planner-sheet-v1');
  }
  expect(continuationOf({ template: 'planner-sheet-v1', status: 'committed', pendingAliases: 0, createdLines: 4, unresolvedConflicts: 0, error: null })).toEqual({
    kind: 'committed',
    steps: [],
  });
});

function brokenBook(): WorkbookLike {
  const lines = [
    ['排产日期', '订单号', '品名', '下单品号', '要求排产', '包材组合', '生产品号', '采购单号', '备注'],
    ['2026-06-09', 'PO20260101000001', '面膜', '70000001', '20万', '组合', '70000002', '/', ''],
    ['排产日期', '订单号', '品名', '下单品号', '要求排产', '包材组合', '生产品号', '采购单号', '备注'],
    ['', '', '', '', '', '', '', '', '只有备注'],
  ];
  return readCsv(new TextEncoder().encode(lines.map((line) => line.join(',')).join('\n')), 'planner-broken.csv');
}

function withoutSheet(book: WorkbookLike, title: string): WorkbookLike {
  return { ...book, sheets: book.sheets.filter((sheet) => sheet.name.trim() !== title) };
}

function noteOf(rows: readonly { readonly rowNo: number; readonly payload: { readonly noteRaw: string }; readonly issues: readonly { readonly code: string; readonly column: string | null }[] }[], rowNo: number): { readonly note: string; readonly formula: boolean } {
  const row = rowOf(rows, rowNo);
  return { note: row.payload.noteRaw, formula: row.issues.some((issue) => issue.code === 'FORMULA_VALUE' && issue.column === '备注') };
}

function rowOf<T extends { readonly rowNo: number }>(rows: readonly T[], rowNo: number): T {
  const found = rows.find((row) => row.rowNo === rowNo);
  if (found === undefined) throw new Error(`没有第 ${rowNo} 行`);
  return found;
}

function read(relative: string): string {
  return readFileSync(path.join(root, relative), 'utf8');
}

function rowIds(): { next(): ReturnType<typeof entityId> } {
  let sequence = 0;
  return {
    next() {
      sequence += 1;
      return entityId(`planner-row-${sequence}`);
    },
  };
}

function batchOf(): ImportBatch {
  return {
    id: entityId('planner-batch'),
    createdAt: AT,
    updatedAt: AT,
    fileId: entityId('planner-file'),
    template: 'planner-sheet-v1',
    factoryPartyId: null,
    status: 'parsed',
    fileMeta: {},
    stats: {},
    decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] },
    createdBy: entityId('admin-1'),
    committedBy: null,
    committedAt: null,
    rolledBackBy: null,
    rolledBackAt: null,
    error: null,
  };
}
