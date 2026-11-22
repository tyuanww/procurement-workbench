import type { ImportIssue } from '../entities/records.js';
import { ISSUE_CATALOG, issueLabel, type IssueCode, type IssueSeverity } from '../vocabulary/issues.js';

export function cellIssue({ code, raw, column = null }: { readonly code: IssueCode; readonly raw: string | null; readonly column?: string | null | undefined }): ImportIssue {
  return {
    code,
    severity: severityOf(code),
    column,
    message: issueLabel(code),
    raw,
  };
}

function severityOf(code: IssueCode): IssueSeverity {
  for (const item of ISSUE_CATALOG) {
    if (item.code === code) return item.severity;
  }
  throw new Error(`问题码没有级别: ${code}`);
}
