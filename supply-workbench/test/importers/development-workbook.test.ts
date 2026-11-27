import { expect, it } from 'vitest';
import { importProject } from '../../apps/web/src/pages/progress/product-development-workbook.js';
import { CreateDevelopmentProjectSchema, DevelopmentWorkbookPreviewSchema } from '../../packages/contracts/src/index.js';
import { previewDevelopmentWorkbook } from '../../packages/importers/src/index.js';
import { readXlsx } from '../../packages/importers/src/workbook/index.js';
import { developmentWorkbook } from './fixtures/development-workbook.js';

function preview(bytes = developmentWorkbook(), fileName = '合成新品.xlsx') {
  return DevelopmentWorkbookPreviewSchema.parse(previewDevelopmentWorkbook({ bytes, fileName, store: 'dafuyan' }));
}

it('按两种表头逐行保留原值、来源地址和可确认日期；不会从页签或混合文本补事实', () => {
  const result = preview();
  expect(result.sheets).toEqual([
    { name: '已下单产品', headerRow: 2, hidden: false },
    { name: '开发中产品', headerRow: 1, hidden: false },
  ]);
  expect(result.candidates).toHaveLength(5);
  const [ordered, received, developing, conflicting, conditional] = result.candidates;
  expect(ordered).toMatchObject({
    title: '合成重复款', store: 'dafuyan', source: { sheet: '已下单产品', row: 3 }, stage: 'development',
    required: { cell: 'D3', rawValue: '2026/12/4', date: '2026-12-04' },
    forecast: { cell: 'E3', label: '预计入仓时间（含5天coa）', rawValue: 46360, displayText: '12-4', date: '2026-12-04' },
    currentNote: { cell: 'F3', rawValue: '请先核对采购量' },
  });
  expect(developing).toMatchObject({
    title: '合成重复款', stage: null,
    contacts: { cell: 'B2', displayText: '测试对接人\n采购 ' },
    currentNote: { label: '主要事项', displayText: '待确认包材\n等样品' },
    forecast: { cell: 'D2', rawValue: '12月下旬' },
  });
  expect(developing?.forecast?.date).toBeUndefined();
  expect(developing?.evidence).toContainEqual(expect.objectContaining({ label: '原料到货', rawValue: '已收货' }));
  expect(received).toMatchObject({ stage: 'received', forecast: { displayText: '已入仓' }, conflicts: [] });
  expect(received?.required?.date).toBeUndefined();
  expect(conflicting).toMatchObject({ stage: null });
  expect(conflicting?.forecast?.date).toBeUndefined();
  expect(conditional).toMatchObject({ stage: null, forecast: { rawValue: 46360 } });
  expect(conditional?.forecast?.date).toBeUndefined();
  expect(result.unidentifiedRows).toMatchObject([
    { source: { sheet: '已下单产品', row: 5 }, evidence: [{ cell: 'E5', rawValue: '待定' }, { cell: 'F5', rawValue: '保留有事项但没有产品名称的原行' }] },
  ]);
});

it('候选行保存可保留模糊日期和空公式原始证据，省略没有填写的业务字段', () => {
  const workbook = preview();
  const candidate = workbook.candidates.find(({ title }) => title === '合成备注款');
  if (candidate === undefined) throw new Error('缺少合成候选行');
  const result = CreateDevelopmentProjectSchema.parse(importProject({ workbook, candidate, fields: { owner: 'product-lead', stage: 'review' } }));
  expect(result.progress?.forecast).toEqual({ raw: '46360' });
  expect(result.progress).not.toHaveProperty('contacts');
  expect(result.progress?.source?.cells).toContainEqual(expect.objectContaining({ address: 'B4', raw: '', formula: 'IF(TRUE,"","核对")' }));
});

it('工作簿预算同时限制归档、工作表和单元格规模', () => {
  const bytes = developmentWorkbook();
  const archiveLimits = { entries: 96, uncompressedBytes: 100_000, sheets: 24, rows: 100, cells: 100, mergedRanges: 10 };
  expect(readXlsx({ bytes, fileName: '合成.xlsx', options: { archiveLimits } }).sheets).toHaveLength(3);
  for (const limit of [{ entries: 2 }, { uncompressedBytes: 300 }, { sheets: 2 }, { rows: 3 }, { cells: 5 }]) {
    expect(() => readXlsx({ bytes, fileName: '合成.xlsx', options: { archiveLimits: { ...archiveLimits, ...limit } } })).toThrow();
  }
});

it('单独列出跨阶段重名和状态冲突，重复上传不改变候选 ID', () => {
  const bytes = developmentWorkbook();
  const result = preview(bytes);
  const [ordered, , developing, conflicting] = result.candidates;
  expect(ordered?.conflicts).toMatchObject([
    { kind: 'tab_stage_mismatch', evidence: [{ cell: 'C3', rawValue: '360（暂未下单）' }] },
    { kind: 'hidden_row', evidence: [{ cell: 'B3', rawValue: '合成重复款' }] },
    { kind: 'duplicate_title', relatedCandidateIds: [developing?.id] },
  ]);
  expect(developing?.conflicts).toMatchObject([{ kind: 'duplicate_title', relatedCandidateIds: [ordered?.id] }]);
  expect(conflicting?.conflicts).toMatchObject([{
    kind: 'explicit_stage_conflict', evidence: [{ cell: 'C3', rawValue: '未下单' }, { cell: 'E3', rawValue: '已下单' }],
  }, { kind: 'tab_stage_mismatch' }]);
  expect(new Set(result.candidates.map(({ id }) => id)).size).toBe(5);
  expect(preview(bytes, '改名后的同一个源文件.xlsx').candidates).toEqual(result.candidates);
  expect(previewDevelopmentWorkbook({ bytes, fileName: '工作簿.xlsx', store: 'yiling' }).candidates[0]?.id).not.toBe(ordered?.id);
});
