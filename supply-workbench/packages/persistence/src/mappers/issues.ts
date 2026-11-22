import { ISSUE_CODES, ISSUE_SEVERITIES, type ImportIssue, type IssueCode, type IssueSeverity } from '@sw/domain';

export function toIssueRecord(counts: Partial<Record<IssueCode, number>>): Record<IssueCode, number> {
  const filled = zeroIssueCounts();
  for (const code of ISSUE_CODES) filled[code] = countOf(counts, code);
  return filled;
}

export function importIssueFrom(value: unknown): ImportIssue | null {
  if (!isRecord(value) || !isCode(value.code) || !isSeverity(value.severity) || typeof value.message !== 'string') return null;
  return { code: value.code, severity: value.severity, column: textOrNull(value.column), message: value.message, raw: textOrNull(value.raw) };
}

function countOf(counts: Partial<Record<IssueCode, number>>, code: IssueCode): number {
  const count = counts[code];
  if (count === undefined) throw new Error(`问题码 ${code} 没有计数`);
  return count;
}

function zeroIssueCounts(): Record<IssueCode, number> {
  const counts: Partial<Record<IssueCode, number>> = {};
  for (const code of ISSUE_CODES) counts[code] = 0;
  if (!isCompleteIssueCount(counts)) throw new Error('问题码零值表不完整');
  return counts;
}

function isCompleteIssueCount(counts: Partial<Record<IssueCode, number>>): counts is Record<IssueCode, number> {
  return ISSUE_CODES.every((code) => counts[code] !== undefined);
}

function isCode(value: unknown): value is IssueCode {
  return typeof value === 'string' && ISSUE_CODES.some((code) => code === value);
}

function isSeverity(value: unknown): value is IssueSeverity {
  return typeof value === 'string' && ISSUE_SEVERITIES.some((severity) => severity === value);
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
