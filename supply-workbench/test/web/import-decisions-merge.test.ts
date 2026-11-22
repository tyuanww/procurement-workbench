import { expect, it } from 'vitest';
import type { ImportBatchSummary, ImportRowView } from '../../packages/application/src/imports/views.js';
import { decisionsWithConflictResolutions, decisionsWithDateDecision } from '../../apps/web/src/features/imports/model/flow.js';

type ImportDecisions = ImportBatchSummary['decisions'];

it('保存当前页冲突时合并已保存的解决，其它页不丢且同 rowId 以当前页为准', () => {
  const existing = decisions({
    rowSkips: [{ rowId: 'row-9', reason: '人工跳过' }],
    conflictResolutions: [
      { rowId: 'row-1', targetOrderLineId: 'line-1' },
      { rowId: 'row-2', targetOrderLineId: 'line-old' },
    ],
  });
  const merged = decisionsWithConflictResolutions({
    decisions: existing,
    rows: [conflictRow('row-2'), conflictRow('row-3')],
    choices: { 'row-2': 'line-new', 'row-3': 'new' },
  });
  expect(merged.conflictResolutions).toEqual([
    { rowId: 'row-1', targetOrderLineId: 'line-1' },
    { rowId: 'row-2', targetOrderLineId: 'line-new' },
    { rowId: 'row-3', targetOrderLineId: null },
  ]);
  expect(merged.rowSkips).toEqual([{ rowId: 'row-9', reason: '人工跳过' }]);
});

it('两页冲突逐页保存后，两页的解决都保留', () => {
  const firstPage = decisionsWithConflictResolutions({ decisions: decisions(), rows: [conflictRow('row-1')], choices: { 'row-1': 'line-1' } });
  const bothPages = decisionsWithConflictResolutions({ decisions: firstPage, rows: [conflictRow('row-2')], choices: { 'row-2': 'new' } });
  expect(bothPages.conflictResolutions).toEqual([
    { rowId: 'row-1', targetOrderLineId: 'line-1' },
    { rowId: 'row-2', targetOrderLineId: null },
  ]);
});

it('按文件年份补年只覆盖日期决定，先保存的冲突解决和跳过不丢', () => {
  const withConflicts = decisionsWithConflictResolutions({
    decisions: decisions({ issueDecisions: { DATE_NO_YEAR: 'keep_null' } }),
    rows: [conflictRow('row-1')],
    choices: { 'row-1': 'line-1' },
  });
  const withSkips: ImportDecisions = { ...withConflicts, rowSkips: [{ rowId: 'row-2', reason: '人工跳过' }] };
  const dated = decisionsWithDateDecision({ decisions: withSkips, choice: 'fill_file_year' });
  expect(dated.issueDecisions).toEqual({ DATE_NO_YEAR: 'fill_file_year' });
  expect(dated.rowSkips).toEqual([{ rowId: 'row-2', reason: '人工跳过' }]);
  expect(dated.conflictResolutions).toEqual([{ rowId: 'row-1', targetOrderLineId: 'line-1' }]);
});

function decisions(patch: Partial<ImportDecisions> = {}): ImportDecisions {
  return { issueDecisions: {}, rowSkips: [], conflictResolutions: [], ...patch };
}

function conflictRow(id: string): ImportRowView {
  return { id, importBatchId: 'batch-1', sheetName: '总表', rowNo: 2, raw: {}, parsed: {}, issues: [], action: 'conflict', targetId: null, skipReason: null };
}
