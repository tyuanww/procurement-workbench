import { IMPORT_ACTIONS, type ImportAction, type ImportIssue } from '@sw/domain';
import type { ImportRowView, ImportRowsQuery } from '../../../../application/src/imports/views.js';
import { importIssueFrom } from '../../mappers/issues.js';
import type { importRows } from '../../schema/archive.js';

export function rowsMatching(rows: readonly (typeof importRows.$inferSelect)[], query: ImportRowsQuery) {
  return rows
    .filter((row) => query.action === undefined || row.action === query.action)
    .filter((row) => query.sheet === undefined || row.sheetName === query.sheet)
    .filter((row) => query.issueCode === undefined || issuesOf(row.issues).some((issue) => issue.code === query.issueCode))
    .sort((left, right) => left.rowNo - right.rowNo);
}

export function pageOf<T>({ rows, page, pageSize }: { readonly rows: readonly T[]; readonly page: number; readonly pageSize: number }): readonly T[] {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

export function rowView(row: typeof importRows.$inferSelect): ImportRowView {
  return {
    id: row.id,
    importBatchId: row.importBatchId,
    sheetName: row.sheetName,
    rowNo: row.rowNo,
    raw: row.raw,
    parsed: row.parsed,
    issues: issuesOf(row.issues),
    action: actionOf(row.action),
    targetId: row.targetId,
    skipReason: row.skipReason,
  };
}

export function issuesOf(value: unknown): ImportIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(issueOf);
}

function issueOf(value: unknown): ImportIssue[] {
  const issue = importIssueFrom(value);
  return issue === null ? [] : [issue];
}

function actionOf(value: string): ImportAction {
  for (const action of IMPORT_ACTIONS) if (action === value) return action;
  throw new Error(`认不出的导入动作: ${value}`);
}
