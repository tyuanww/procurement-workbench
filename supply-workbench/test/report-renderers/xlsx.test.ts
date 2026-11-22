import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import type { WeeklyReportData } from '../../packages/application/src/reporting/views.js';
import { templates } from '../../packages/importers/src/registry.js';
import { readXlsx } from '../../packages/importers/src/workbook/read.js';
import { xlsxRenderer } from '../../packages/report-renderers/src/xlsx/index.js';
import { write } from '../../packages/report-renderers/src/xlsx/writer.js';
import { closedShortMaterial, meeting, meetingMaterial } from './meeting-fixture.js';

it('缺失值导出为空格子加批注，不写 0', () => {
  const sheet = readSheet(write({ sheets: [{ name: '订单行', rows: [['数量'], [null]] }] }), '订单行');
  const cell = cellOf(sheet, 'A2');
  expect(cell?.v).not.toBe(0);
  expect(cell?.v).toBe('');
  expect(noteOf(cell)).toContain('不是 0');
});

it('周报每个部分一张表，并有数据说明', async () => {
  const bytes = await xlsxRenderer().render(sample());
  const book = readBook(bytes);
  expect(book.names).toEqual(['总览', '风险', '卡点', '供应商', '采购', '异常', '下周应到', '数据说明']);
  expect(textOf(readSheet(bytes, '风险'), '!ref')).toBe('A1:D2');
});

it('导出表保留周会的采购依据、新品回复和决定完成证据', async () => {
  const book = readBook(await xlsxRenderer().render({ ...sample(), managementMeeting: [meeting] }));
  expect(JSON.stringify(book.sheets)).toContain('工厂承诺补齐盖子');
  expect(JSON.stringify(book.sheets)).toContain('周五到工厂');
  expect(JSON.stringify(book.sheets)).toContain('点收完成回执');
});

it('关闭的短收批次保留实收量，导出不显示收齐', async () => {
  const bytes = await xlsxRenderer().render({ ...sample(), managementMeeting: [{ ...meeting, materials: [closedShortMaterial] }] });
  const sheet = readSheet(bytes, '周会采购事项');
  expect(cellOf(sheet, 'D2')?.v).toContain('实收 10 个');
  expect(cellOf(readSheet(bytes, '周会批次承诺'), 'I2')?.v).toBe('无待处理履约');
});

it('同一采购事项的多批承诺原话各自完整导出', async () => {
  const first = meetingMaterial.batches[0];
  if (first === undefined || first.previousPromiseText === null) throw new Error('周会样本缺采购承诺');
  const at = first.previousPromiseText.recordedAt;
  const text = '采购经过逐行核实'.repeat(245);
  const batches = Array.from({ length: 17 }, (_, index) => ({
    ...first, id: `promise-${index}`, seq: index + 1,
    previousPromiseText: { text: `承诺 ${index + 1} ${text}`, recordedAt: at },
  }));
  const bytes = await xlsxRenderer().render({ ...sample(), managementMeeting: [{ ...meeting, materials: [{ ...meetingMaterial, batches }] }] });
  const sheet = readSheet(bytes, '周会批次承诺');
  expect(cellOf(sheet, 'E2')?.v).toBe(`承诺 1 ${text}\n${at}`);
  expect(cellOf(sheet, 'E18')?.v).toBe(`承诺 17 ${text}\n${at}`);
});

it('卡点里的阶段是中文，表头仍叫阶段', async () => {
  const bytes = await xlsxRenderer().render({
    ...sample(),
    stuck: [{ stage: 'shipped', buckets: { '0-3': 1, '4-7': 0, '8-14': 0, '15+': 2 } }],
  });
  const sheet = readSheet(bytes, '卡点');
  expect(cellOf(sheet, 'A1')?.v).toBe('阶段');
  expect(cellOf(sheet, 'B1')?.v).toBe('0-3');
  expect(cellOf(sheet, 'E1')?.v).toBe('15+');
  expect(cellOf(sheet, 'F1')?.v).toBe('阶段码');
  expect(cellOf(sheet, 'A2')?.v).toBe('已发货');
  expect(cellOf(sheet, 'B2')?.v).toBe(1);
  expect(cellOf(sheet, 'F2')?.v).toBe('shipped');
  const book = readXlsx({ bytes, fileName: 'weekly.xlsx' });
  expect(templates.map((template) => template.detect(book).score)).toEqual(templates.map(() => 0));
});

function readSheet(bytes: Uint8Array, name: string): Record<string, unknown> | undefined {
  return readBook(bytes).sheets[name];
}

function readBook(bytes: Uint8Array): { readonly names: readonly string[]; readonly sheets: Readonly<Record<string, Record<string, unknown>>> } {
  const book = callRead(bytes);
  if (!isRecord(book) || !Array.isArray(book.SheetNames) || !isRecord(book.Sheets)) throw new Error('xlsx 没有工作簿');
  const names = book.SheetNames.filter((name): name is string => typeof name === 'string');
  const sheets: Record<string, Record<string, unknown>> = {};
  for (const name of names) {
    const sheet = book.Sheets[name];
    if (isRecord(sheet)) sheets[name] = sheet;
  }
  return { names, sheets };
}

function callRead(bytes: Uint8Array): unknown {
  const loaded: unknown = createRequire(new URL('../../packages/report-renderers/package.json', import.meta.url))('xlsx');
  if (!isRecord(loaded) || !isCallable(loaded.read)) throw new Error('xlsx 没有 read');
  return loaded.read(bytes, { type: 'array' });
}

function cellOf(sheet: Record<string, unknown> | undefined, key: string): { readonly v: unknown; readonly notes: readonly string[] } | undefined {
  const cell = sheet?.[key];
  if (!isRecord(cell)) return undefined;
  return { v: cell.v, notes: notesOf(cell.c) };
}

function notesOf(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => isRecord(item) && typeof item.t === 'string' ? [item.t] : []);
}

function noteOf(cell: { readonly notes: readonly string[] } | undefined): string {
  return cell?.notes[0] ?? '';
}

function textOf(sheet: Record<string, unknown> | undefined, key: string): unknown {
  return sheet?.[key];
}

function isCallable(value: unknown): value is (...args: readonly unknown[]) => unknown {
  return typeof value === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sample(): WeeklyReportData {
  return {
    overview: {
      dueBatches: { value: 1, previous: null },
      onTime: { value: { rate: null, n: 0 }, previous: null },
      overdue: { value: 0, previous: null },
      exceptionsOpened: 0,
      exceptionsClosed: 0,
      missingDateRate: null,
    },
    risks: [{ batchId: 'b1', orderLineId: 'l1', overdueDays: null, nameRaw: null }],
    stuck: [],
    suppliers: [],
    buyers: [],
    exceptions: { opened: 0, closed: 0 },
    dueNextWeek: [],
    notes: { sources: [], basedOnWorkbenchRecords: true },
  };
}
