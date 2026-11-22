import { importStatusLabel, issueText, type ImportStatus, type TemplateId } from '@sw/domain';
import type { ImportBatchSummary, ImportRowView } from '@sw/contracts';
import { conflictResolutionsOf } from './conflicts.js';

type ImportDecisions = ImportBatchSummary['decisions'];
type DateDecision = 'fill_file_year' | 'keep_null';

export type NextStep = { readonly to: string; readonly label: string };

export type ImportContinuationInput = {
  readonly template: TemplateId;
  readonly status: ImportStatus;
  readonly pendingAliases: number;
  readonly createdLines: number;
  readonly unresolvedConflicts: number;
  readonly error: string | null;
};

export type ImportContinuation =
  | { readonly kind: 'confirm'; readonly enabled: boolean; readonly remaining: number }
  | { readonly kind: 'committed'; readonly steps: readonly NextStep[] }
  | { readonly kind: 'blocked'; readonly message: string };

export function canStartParse(input: { readonly requiresFactory: boolean; readonly factoryPartyId: string | null }): boolean {
  if (!input.requiresFactory) return true;
  return input.factoryPartyId !== null && input.factoryPartyId !== '';
}

export function continuationOf(input: ImportContinuationInput): ImportContinuation {
  switch (input.status) {
    case 'parsed':
      return { kind: 'confirm', enabled: input.unresolvedConflicts === 0, remaining: input.unresolvedConflicts };
    case 'committed':
      return { kind: 'committed', steps: committedSteps(input) };
    case 'failed':
    case 'discarded':
      return { kind: 'blocked', message: blockedMessage(input) };
  }
}

function committedSteps(input: ImportContinuationInput): readonly NextStep[] {
  return [...aliasStep(input.pendingAliases), ...afterReview(input)];
}

function aliasStep(pendingAliases: number): readonly NextStep[] {
  if (pendingAliases <= 0) return [];
  return [{ to: '/master', label: `去审核 ${pendingAliases} 个新主体` }];
}

const COMMITTED_STEP: Partial<Record<TemplateId, NextStep>> = {
  'factory-progress-v1': { to: '/lines', label: '去跟进台' },
  'product-archive-v1': { to: '/products', label: '去产品档案' },
};

function afterReview(input: ImportContinuationInput): readonly NextStep[] {
  if (input.template === 'po-master-v1') return poSteps(input.createdLines);
  const step = COMMITTED_STEP[input.template];
  if (step === undefined) return [];
  return [step];
}

function poSteps(createdLines: number): readonly NextStep[] {
  return [
    { to: '/lines', label: `去跟进台看 ${createdLines} 行` },
    { to: '/lines', label: '按总表首批生成待确认批次' },
  ];
}

function blockedMessage(input: { readonly status: ImportStatus; readonly error: string | null }): string {
  if (input.error !== null && input.error !== '') return input.error;
  return importStatusLabel(input.status);
}

export function issueGroupText(group: { readonly code: string; readonly count: number }): string {
  return `${issueText(group.code)} · ${group.count} 行`;
}

export function groupIssues(rows: readonly { readonly issues: readonly { readonly code: string }[] }[]): { readonly code: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) addIssues(counts, row.issues);
  return [...counts].map(([code, count]) => ({ code, count }));
}

export function issueDecision(choice: DateDecision) {
  return { issueDecisions: { DATE_NO_YEAR: choice }, rowSkips: [], conflictResolutions: [] };
}

/** “按文件年份补年”只覆盖日期决定，已保存的跳过/冲突解决保持原样。 */
export function decisionsWithDateDecision(input: { readonly decisions: ImportDecisions; readonly choice: DateDecision }): ImportDecisions {
  return { ...input.decisions, issueDecisions: { ...input.decisions.issueDecisions, ...issueDecision(input.choice).issueDecisions } };
}

/** 只把当前页的冲突选择合并进已保存的解决，其它页的解决不丢；同 rowId 以当前页为准。 */
export function decisionsWithConflictResolutions(input: {
  readonly decisions: ImportDecisions;
  readonly rows: readonly ImportRowView[];
  readonly choices: Readonly<Record<string, string>>;
}): ImportDecisions {
  const resolved = new Map(input.decisions.conflictResolutions.map((item) => [item.rowId, item] as const));
  for (const resolution of conflictResolutionsOf({ rows: input.rows, choices: input.choices })) resolved.set(resolution.rowId, resolution);
  return { ...input.decisions, conflictResolutions: [...resolved.values()] };
}

function addIssues(counts: Map<string, number>, issues: readonly { readonly code: string }[]): void {
  for (const issue of issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
}
