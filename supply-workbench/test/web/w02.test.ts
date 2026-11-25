import { describe, expect, it } from 'vitest';
import { canStartParse, continuationOf, groupIssues, issueDecision, issueGroupText, type ImportContinuation, type ImportContinuationInput } from '../../apps/web/src/features/imports/model/flow.js';

describe('导入按钮和问题分组', () => {
  it('代工厂模板没选代工厂不能开始解析', () => {
    expect(canStartParse({ requiresFactory: true, factoryPartyId: null })).toBe(false);
    expect(canStartParse({ requiresFactory: true, factoryPartyId: '' })).toBe(false);
    expect(canStartParse({ requiresFactory: true, factoryPartyId: 'factory-yinong' })).toBe(true);
    expect(canStartParse({ requiresFactory: false, factoryPartyId: null })).toBe(true);
  });

  it('还有冲突时确认导入不可用，并显示剩余个数', () => {
    expect(continuationOf(summary({ template: 'po-master-v1', status: 'parsed', pendingAliases: 0, unresolvedConflicts: 3, error: null }))).toEqual({ kind: 'confirm', enabled: false, remaining: 3 });
    expect(continuationOf(summary({ template: 'po-master-v1', status: 'parsed', pendingAliases: 0, unresolvedConflicts: 0, error: null }))).toEqual({ kind: 'confirm', enabled: true, remaining: 0 });
  });

  it('问题按类型分组，四种模板提交后进入各自的下一步', () => {
    expect(groupIssues([{ issues: [{ code: 'DATE_NO_YEAR' }, { code: 'DATE_NO_YEAR' }] }, { issues: [{ code: 'BARCODE_SUFFIX' }] }])).toEqual([
      { code: 'DATE_NO_YEAR', count: 2 },
      { code: 'BARCODE_SUFFIX', count: 1 },
    ]);
    expect(continuationOf(summary({ template: 'po-master-v1', status: 'committed', pendingAliases: 26, unresolvedConflicts: 0, error: null }))).toEqual({
      kind: 'committed',
      steps: [
        { to: '/master', label: '去审核 26 个新主体' },
        { to: '/lines?lane=all&importBatchId=batch-a', label: '查看本次导入订单' },
      ],
    });
    expect(stepLabels(continuationOf(summary({ template: 'po-master-v1', status: 'committed', pendingAliases: 0, unresolvedConflicts: 0, error: null })))).toEqual([
      '查看本次导入订单',
    ]);
    const factory = continuationOf(summary({ template: 'factory-progress-v1', status: 'committed', pendingAliases: 4, unresolvedConflicts: 0, error: null }));
    expect(factory).toEqual({
      kind: 'committed',
      steps: [
        { to: '/master', label: '去审核 4 个新主体' },
        { to: '/lines', label: '去跟进中心' },
      ],
    });
    expect(stepLabels(factory).join('')).not.toContain('行');
    expect(stepLabels(factory).join('')).not.toContain('按总表');
    expect(stepLabels(continuationOf(summary({ template: 'factory-progress-v1', status: 'committed', pendingAliases: 0, unresolvedConflicts: 0, error: null })))).toEqual(['去跟进中心']);
    expect(stepLabels(continuationOf(summary({ template: 'product-archive-v1', status: 'committed', pendingAliases: 2, unresolvedConflicts: 0, error: null })))).toEqual(['去审核 2 个新主体', '去产品档案']);
    expect(stepLabels(continuationOf(summary({ template: 'product-archive-v1', status: 'committed', pendingAliases: 0, unresolvedConflicts: 0, error: null })))).toEqual(['去产品档案']);
    expect(stepLabels(continuationOf(summary({ template: 'bom-v1', status: 'committed', pendingAliases: 3, unresolvedConflicts: 0, error: null })))).toEqual(['去审核 3 个新主体']);
    expect(stepLabels(continuationOf(summary({ template: 'bom-v1', status: 'committed', pendingAliases: 0, unresolvedConflicts: 0, error: null })))).toEqual([]);
  });

  it('失败、放弃和回滚只给出原因，不给下一步', () => {
    expect(continuationOf(summary({ template: 'factory-progress-v1', status: 'failed', pendingAliases: 1, unresolvedConflicts: 0, error: '表头不对' }))).toEqual({ kind: 'blocked', message: '表头不对' });
    expect(continuationOf(summary({ template: 'factory-progress-v1', status: 'failed', pendingAliases: 1, unresolvedConflicts: 0, error: '' }))).toEqual({ kind: 'blocked', message: '解析失败' });
    expect(continuationOf(summary({ template: 'factory-progress-v1', status: 'failed', pendingAliases: 1, unresolvedConflicts: 0, error: null }))).toEqual({ kind: 'blocked', message: '解析失败' });
    expect(continuationOf(summary({ template: 'po-master-v1', status: 'discarded', pendingAliases: 0, unresolvedConflicts: 0, error: null }))).toEqual({ kind: 'blocked', message: '已放弃' });
  });

  it('问题决策和分组文案', () => {
    expect(issueDecision('fill_file_year')).toEqual({ issueDecisions: { DATE_NO_YEAR: 'fill_file_year' }, rowSkips: [], conflictResolutions: [] });
    expect(issueGroupText({ code: 'DATE_NO_YEAR', count: 2 })).toBe('日期没有年份 · 2 行');
    expect(issueGroupText({ code: 'NOPE', count: 1 })).toBe('NOPE · 1 行');
  });
});

function summary(input: Omit<ImportContinuationInput, 'importBatchId' | 'canReviewAliases'>): ImportContinuationInput {
  return { ...input, importBatchId: 'batch-a', canReviewAliases: true };
}

function stepLabels(value: ImportContinuation): readonly string[] {
  if (value.kind !== 'committed') throw new Error('不是已提交');
  return value.steps.map((step) => step.label);
}
