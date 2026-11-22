import { importCoverageOf, ISSUE_CODES, IMPORT_ACTIONS, ISSUE_CATALOG, TEMPLATE_IDS, IMPORT_STATUSES, normalizeText, type ImportAction, type IssueCode, type IssueSeverity } from '@sw/domain';
import type { ImportBatchSummary, ImportDecisions } from '../../../../application/src/imports/views.js';
import { instant, instantOrNull } from '../../mappers/time.js';
import { toIssueRecord } from '../../mappers/issues.js';
import type { importBatches, importRows } from '../../schema/archive.js';
import type { itemCodes, parties, partyAliases, storedFiles, users } from '../../schema/platform.js';
import { issuesOf } from './rows.js';

const SAMPLE_LIMIT = 5;

type Lookup = {
  readonly userRows: readonly (typeof users.$inferSelect)[];
  readonly partyRows: readonly (typeof parties.$inferSelect)[];
  readonly fileRows: readonly (typeof storedFiles.$inferSelect)[];
  readonly aliasRows: readonly (typeof partyAliases.$inferSelect)[];
  readonly codeRows: readonly (typeof itemCodes.$inferSelect)[];
};

export function toSummary({ batch, rows, names, hasProcurementPreview }: { readonly batch: typeof importBatches.$inferSelect; readonly rows: readonly (typeof importRows.$inferSelect)[]; readonly names: Lookup; readonly hasProcurementPreview?: boolean }): ImportBatchSummary {
  const issues = rows.flatMap((row) => issuesOf(row.issues).map((issue) => ({ ...issue, sheet: row.sheetName, rowNo: row.rowNo })));
  const candidateKeyVersion = candidateKeyVersionOf(batch.fileMeta);
  const procurementReplayOf = textOf(batch.fileMeta, 'procurementReplayOf');
  return {
    id: batch.id,
    template: oneOf({ values: TEMPLATE_IDS, value: batch.template, label: '模板' }),
    factoryParty: partyOf(names.partyRows, batch.factoryPartyId),
    status: oneOf({ values: IMPORT_STATUSES, value: batch.status, label: '导入状态' }),
    coverage: importCoverageOf(batch.coverage),
    ...(batch.sourceKey === null ? {} : { source: { key: batch.sourceKey, fingerprint: batch.sourceFingerprint, effectiveAt: instantOrNull(batch.effectiveAt), supersededAt: instantOrNull(batch.supersededAt) } }),
    ...(candidateKeyVersion === null ? {} : { candidateKeyVersion }),
    revision: batch.revision === undefined ? 0 : batch.revision,
    file: fileOf(batch, names.fileRows),
    fileMeta: metaOf(batch.fileMeta),
    ...(hasProcurementPreview === true ? { hasProcurementPreview } : {}),
    ...(procurementReplayOf === null ? {} : { procurementReplayOf }),
    stats: {
      rows: rows.length,
      byAction: byAction(rows),
      byIssue: byIssue(issues),
      pendingAliases: pendingAliases(rows, names.aliasRows),
      pendingCodes: pendingCodes(rows, names.codeRows),
      pendingLinks: pendingLinks(batch.template, batch.fileMeta),
    },
    issueGroups: groupsOf(issues),
    ignoredSheets: stringsOf(batch.fileMeta, 'ignoredSheets'),
    decisions: decisionsOf(batch.decisions),
    unresolvedConflicts: rows.filter((row) => row.action === 'conflict').length,
    createdBy: userOf(names.userRows, batch.createdBy),
    createdAt: instant(batch.createdAt),
    committedBy: batch.committedBy === null ? null : userOf(names.userRows, batch.committedBy),
    committedAt: instantOrNull(batch.committedAt),
    error: batch.error,
  };
}

function fileOf(batch: typeof importBatches.$inferSelect, files: Lookup['fileRows']) {
  const stored = files.find((file) => file.sha256 === batch.fileId);
  const size = stored?.size ?? bytesOf(batch.fileMeta);
  if (size === undefined) throw new Error(`导入批次 ${batch.id} 没有文件大小`);
  return { originalName: stored?.originalName ?? batch.fileId, size, sha256: batch.fileId };
}

function metaOf(value: unknown) {
  return { sheets: sheetsOf(value), coreXmlModifiedAt: textOf(value, 'coreXmlModifiedAt') };
}

function candidateKeyVersionOf(value: unknown): string | null {
  return textOf(value, 'candidateKeyVersion');
}

function sheetsOf(value: unknown): { readonly name: string; readonly hidden: boolean }[] {
  if (!isRecord(value) || !Array.isArray(value.sheets)) return [];
  return value.sheets.flatMap(sheetOf);
}

function sheetOf(value: unknown): { readonly name: string; readonly hidden: boolean }[] {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.hidden !== 'boolean') return [];
  return [{ name: value.name, hidden: value.hidden }];
}

function byAction(rows: readonly { readonly action: string }[]): Record<ImportAction, number> {
  const counts: Record<ImportAction, number> = { create: 0, update: 0, unchanged: 0, conflict: 0, skip: 0 };
  for (const row of rows) {
    if (isAction(row.action)) counts[row.action] += 1;
  }
  return counts;
}

function byIssue(issues: readonly { readonly code: IssueCode }[]): Record<IssueCode, number> {
  const counts: Partial<Record<IssueCode, number>> = {};
  for (const code of ISSUE_CODES) counts[code] = countOf(issues, code);
  return completeIssues(counts);
}

function countOf(issues: readonly { readonly code: IssueCode }[], code: IssueCode): number {
  return issues.filter((issue) => issue.code === code).length;
}

function groupsOf(issues: readonly { readonly code: IssueCode; readonly sheet: string; readonly rowNo: number; readonly column: string | null; readonly raw: string | null }[]): ImportBatchSummary['issueGroups'] {
  const grouped = new Map<IssueCode, typeof issues>();
  for (const issue of issues) grouped.set(issue.code, [...(grouped.get(issue.code) ?? []), issue]);
  return [...grouped].map(([code, samples]) => ({
    code,
    severity: severityOf(code),
    count: samples.length,
    samples: samples.slice(0, SAMPLE_LIMIT).map((sample) => ({ sheet: sample.sheet, rowNo: sample.rowNo, column: sample.column, raw: sample.raw })),
    availableDecisions: code === 'DATE_NO_YEAR' ? ['fill_file_year', 'keep_null'] : [],
  }));
}

function pendingAliases(rows: readonly { readonly parsed: unknown }[], aliases: Lookup['aliasRows']): number {
  const approved = new Set(aliases.filter((alias) => alias.status === 'approved').map((alias) => alias.normName));
  const names = new Set<string>();
  for (const name of rows.flatMap((row) => texts(row.parsed, 'supplierRaw'))) {
    const norm = normalizeText(name);
    if (!approved.has(norm)) names.add(norm);
  }
  return names.size;
}

function pendingCodes(rows: readonly { readonly parsed: unknown }[], codes: Lookup['codeRows']): number {
  const known = new Set(codes.map((code) => code.codeNorm));
  const found = new Set(rows.flatMap((row) => [...texts(row.parsed, 'itemCodeRaw'), ...texts(row.parsed, 'barcodeRaw')]).map((code) => normalizeText(code)));
  return [...found].filter((code) => !known.has(code)).length;
}

function pendingLinks(template: string, value: unknown): number {
  if (isRecord(value) && typeof value.pendingLinks === 'number') return value.pendingLinks;
  if (template !== 'factory-progress-v1') return 0;
  throw new Error('代工厂批次没有待审核对照计数');
}

function decisionsOf(value: unknown): ImportDecisions {
  if (!isRecord(value)) return { issueDecisions: {}, rowSkips: [], conflictResolutions: [] };
  return { issueDecisions: dateDecision(value.issueDecisions), rowSkips: skipsOf(value.rowSkips), conflictResolutions: resolutionsOf(value.conflictResolutions) };
}

function dateDecision(value: unknown): ImportDecisions['issueDecisions'] {
  if (!isRecord(value)) return {};
  if (value.DATE_NO_YEAR === 'fill_file_year' || value.DATE_NO_YEAR === 'keep_null') return { DATE_NO_YEAR: value.DATE_NO_YEAR };
  return {};
}

function skipsOf(value: unknown): ImportDecisions['rowSkips'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (isRecord(item) && typeof item.rowId === 'string' && typeof item.reason === 'string' ? [{ rowId: item.rowId, reason: item.reason }] : []));
}

function resolutionsOf(value: unknown): ImportDecisions['conflictResolutions'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.rowId !== 'string') return [];
    const target = item.targetOrderLineId;
    if (target !== null && typeof target !== 'string') return [];
    return [{ rowId: item.rowId, targetOrderLineId: target }];
  });
}

function partyOf(rows: Lookup['partyRows'], id: string | null) {
  if (id === null) return null;
  const party = rows.find((item) => item.id === id);
  if (party === undefined) return { id, displayName: null, rawName: null };
  return { id: party.id, displayName: party.displayName, rawName: null };
}

function userOf(rows: Lookup['userRows'], id: string) {
  const user = rows.find((item) => item.id === id);
  return { id, name: user?.name ?? id };
}

function texts(value: unknown, key: string): string[] {
  if (!isRecord(value)) return [];
  const cell = value[key];
  if (!isRecord(cell) || typeof cell.value !== 'string' || cell.value === '') return [];
  return [cell.value];
}

function bytesOf(value: unknown): number | undefined {
  if (!isRecord(value) || typeof value.bytes !== 'number') return undefined;
  return value.bytes;
}

function stringsOf(value: unknown, key: string): string[] {
  if (!isRecord(value) || !Array.isArray(value[key])) return [];
  return value[key].filter((item) => typeof item === 'string');
}

function textOf(value: unknown, key: string): string | null {
  if (!isRecord(value) || typeof value[key] !== 'string') return null;
  return value[key];
}

function completeIssues(counts: Partial<Record<IssueCode, number>>): Record<IssueCode, number> {
  return toIssueRecord(counts);
}

function severityOf(code: IssueCode): IssueSeverity {
  for (const item of ISSUE_CATALOG) if (item.code === code) return item.severity;
  throw new Error(`问题码没有级别: ${code}`);
}

function isAction(value: string): value is ImportAction {
  return IMPORT_ACTIONS.some((action) => action === value);
}

function oneOf<T extends string>({ values, value, label }: { readonly values: readonly T[]; readonly value: string; readonly label: string }): T {
  for (const item of values) if (item === value) return item;
  throw new Error(`认不出的${label}: ${value}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
