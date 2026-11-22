import {
  BATCH_STATUSES,
  isLocalDate,
  TEMPLATE_IDS,
  type BatchStatus,
  type LocalDate,
  type TemplateId,
} from '@sw/domain';
import type { WeeklyReportData, WeeklyReportListItem } from '../views.js';

export type StoredWeekly = {
  readonly report: WeeklyReportData;
  readonly generatedByName: string;
  readonly exports: WeeklyReportListItem['exports'];
};

const EXPORT_FORMATS = ['xlsx', 'pdf', 'png', 'feishu'] as const;

export function packWeekly({ report, generatedByName, exports = [] }: { readonly report: WeeklyReportData; readonly generatedByName: string; readonly exports?: WeeklyReportListItem['exports'] | undefined }): StoredWeekly {
  return { report, generatedByName, exports };
}

export function unpackWeekly(data: unknown): StoredWeekly | null {
  if (!isStored(data)) return null;
  return data;
}

function isStored(data: unknown): data is StoredWeekly {
  if (!isRecord(data) || typeof data.generatedByName !== 'string' || !Array.isArray(data.exports)) return false;
  return data.exports.every(isExport) && isWeeklyReport(data.report);
}

function isExport(value: unknown): value is WeeklyReportListItem['exports'][number] {
  if (!isRecord(value) || typeof value.format !== 'string' || !EXPORT_FORMATS.some((format) => format === value.format)) return false;
  return isNullableText(value.fileId) && isNullableText(value.docUrl);
}

function isWeeklyReport(value: unknown): value is WeeklyReportData {
  if (!isRecord(value)) return false;
  return isOverview(value.overview) && isRisks(value.risks) && isStuck(value.stuck) && isTail(value);
}

function isTail(value: Record<string, unknown>): boolean {
  return isSuppliers(value.suppliers) && isBuyers(value.buyers) && isExceptions(value.exceptions) && isDueNext(value.dueNextWeek) && isNotes(value.notes);
}

function isOverview(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNumberDelta(value.dueBatches) && isRateDelta(value.onTime) && isNumberDelta(value.overdue) && isCounts(value);
}

function isCounts(value: Record<string, unknown>): boolean {
  return typeof value.exceptionsOpened === 'number' && typeof value.exceptionsClosed === 'number' && isNullableNumber(value.missingDateRate);
}

function isNumberDelta(value: unknown): boolean {
  if (!isRecord(value) || typeof value.value !== 'number') return false;
  return isNullableNumber(value.previous);
}

function isRateDelta(value: unknown): boolean {
  if (!isRecord(value) || !isRate(value.value)) return false;
  return value.previous === null || isRate(value.previous);
}

function isRate(value: unknown): boolean {
  if (!isRecord(value) || typeof value.n !== 'number') return false;
  return isNullableNumber(value.rate);
}

function isRisks(value: unknown): boolean {
  return Array.isArray(value) && value.every(isRisk);
}

function isRisk(value: unknown): boolean {
  if (!isRecord(value) || typeof value.batchId !== 'string' || typeof value.orderLineId !== 'string') return false;
  return isNullableNumber(value.overdueDays) && isNullableText(value.nameRaw);
}

function isStuck(value: unknown): boolean {
  return Array.isArray(value) && value.every(isStuckRow);
}

function isStuckRow(value: unknown): boolean {
  if (!isRecord(value) || !isBatchStatus(value.stage) || !isRecord(value.buckets)) return false;
  return typeof value.buckets['0-3'] === 'number' && typeof value.buckets['4-7'] === 'number' && typeof value.buckets['8-14'] === 'number' && typeof value.buckets['15+'] === 'number';
}

function isSuppliers(value: unknown): boolean {
  return Array.isArray(value) && value.every(isSupplier);
}

function isSupplier(value: unknown): value is WeeklyReportData['suppliers'][number] {
  if (!isRecord(value) || typeof value.partyId !== 'string' || !isNullableText(value.displayName)) return false;
  return isFigure(value.dueBatches) && isFigure(value.onTime) && isFigure(value.averageDelayDays) && isFigure(value.overdueNow) && isRestSupplier(value);
}

function isRestSupplier(value: Record<string, unknown>): boolean {
  return isFigure(value.dateChanges) && isFigure(value.noteReturnDays) && isFigure(value.openExceptions) && Array.isArray(value.weekly) && value.weekly.every(isWeek);
}

function isWeek(value: unknown): boolean {
  if (!isRecord(value) || !isDate(value.weekStart) || typeof value.n !== 'number') return false;
  return isNullableNumber(value.rate);
}

function isBuyers(value: unknown): boolean {
  return Array.isArray(value) && value.every(isBuyer);
}

function isBuyer(value: unknown): value is WeeklyReportData['buyers'][number] {
  if (!isRecord(value) || !isPerson(value.buyer)) return false;
  return isNullableNumber(value.openLines) && typeof value.openBatches === 'number' && typeof value.overdue === 'number' && isBuyerRest(value);
}

function isBuyerRest(value: Record<string, unknown>): boolean {
  return typeof value.dueToday === 'number' && typeof value.missingDate === 'number' && isNullableNumber(value.openExceptions) && isNullableNumber(value.followUpsInPeriod);
}

function isPerson(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  return isNullableText(value.name);
}

function isExceptions(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.opened === 'number' && typeof value.closed === 'number';
}

function isDueNext(value: unknown): boolean {
  return Array.isArray(value) && value.every(isDue);
}

function isDue(value: unknown): boolean {
  if (!isRecord(value) || typeof value.batchId !== 'string' || !isDate(value.dueDate)) return false;
  return isNullableText(value.nameRaw);
}

function isNotes(value: unknown): boolean {
  if (!isRecord(value) || value.basedOnWorkbenchRecords !== true || !Array.isArray(value.sources)) return false;
  return value.sources.every(isSource);
}

function isSource(value: unknown): value is WeeklyReportData['notes']['sources'][number] {
  if (!isRecord(value) || !isTemplate(value.template) || typeof value.label !== 'string') return false;
  return isNullableText(value.factoryPartyId) && isNullableText(value.lastCommittedAt) && isNullableText(value.fileModifiedAt);
}

function isFigure(value: unknown): boolean {
  if (!isRecord(value) || typeof value.n !== 'number') return false;
  return isNullableNumber(value.numerator) && isNullableNumber(value.denominator);
}

function isBatchStatus(value: unknown): value is BatchStatus {
  return typeof value === 'string' && BATCH_STATUSES.some((status) => status === value);
}

function isTemplate(value: unknown): value is TemplateId {
  return typeof value === 'string' && TEMPLATE_IDS.some((template) => template === value);
}

function isDate(value: unknown): value is LocalDate {
  return typeof value === 'string' && isLocalDate(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
