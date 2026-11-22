import {
  BATCH_STATUSES,
  addDays,
  averageDelay,
  buyerLoads,
  currentlyOverdue,
  diffDays,
  dueBatches,
  isOpenBatch,
  localDate,
  noteReturnDays,
  onTimeRate,
  stuckDistribution,
  weeklyOnTime,
  type KpiInput,
  type KpiMeasure,
  type LocalDate,
} from '@sw/domain';
import type { PerformanceFacts } from '../../ports/performance-read-model.js';
import type { FreshnessSource } from '../../platform/index.js';
import { scopedSupplierIds, supplierEvents, supplierEventFigures, type BuyerLoadRow, type SupplierKpiRow, type SupplierWeek } from '../../performance/index.js';
import type { WeekDelta, WeeklyReportData } from '../views.js';

const WEEK_DAYS = 7;
const WEEK_END_OFFSET = 6;
const NEXT_WEEK_OFFSET = 1;
const RISK_LIMIT = 20;

export type WeeklyAssemblyInput = {
  readonly weekStart: LocalDate;
  readonly facts: PerformanceFacts;
  readonly previous: WeeklyReportData | null;
  readonly sources: readonly FreshnessSource[];
};

export function assembleWeeklyReport(input: WeeklyAssemblyInput): WeeklyReportData {
  const week = scoped(input.facts, input.weekStart);
  const overview = overviewOf(week, input.previous);
  return {
    overview,
    risks: risksOf(week, input.facts.batchLabels),
    stuck: distributionOf(week),
    suppliers: supplierRows(week, input.facts.partyNames),
    supplierUnassigned: supplierEvents(week, { partyId: null }),
    buyers: buyerRows(week, input.facts),
    exceptions: { opened: overview.exceptionsOpened, closed: overview.exceptionsClosed },
    dueNextWeek: dueNext(week, input.facts.batchLabels),
    notes: { sources: input.sources, basedOnWorkbenchRecords: true },
  };
}

export function weekEnd(start: LocalDate): LocalDate {
  return addDays(start, WEEK_END_OFFSET);
}

export function previousWeek(start: LocalDate): LocalDate {
  return addDays(start, -WEEK_DAYS);
}

function scoped(facts: PerformanceFacts, start: LocalDate): KpiInput {
  return { ...facts.kpi, from: start, to: weekEnd(start) };
}

function overviewOf(input: KpiInput, previous: WeeklyReportData | null): WeeklyReportData['overview'] {
  const due = dueBatches(input).numerator;
  const onTime = onTimeRate(input);
  const overdue = currentlyOverdue(input).numerator;
  const closed = closedInWeek(input);
  return {
    dueBatches: delta(due, previous?.overview.dueBatches.value ?? null),
    onTime: delta({ rate: onTime.value, n: onTime.n }, previous?.overview.onTime.value ?? null),
    overdue: delta(overdue, previous?.overview.overdue.value ?? null),
    exceptionsOpened: closed.opened,
    exceptionsClosed: closed.closed,
    missingDateRate: missingRate(input),
  };
}

function delta<T>(value: T, previous: T | null): WeekDelta<T> {
  return { value, previous };
}

function closedInWeek(input: KpiInput): { readonly opened: number; readonly closed: number } {
  return {
    opened: input.exceptions.filter((item) => inWeek(item.openedAt, input)).length,
    closed: input.exceptions.filter((item) => item.closedAt !== null && inWeek(item.closedAt, input)).length,
  };
}

function missingRate(input: KpiInput): number | null {
  const open = input.batches.filter((batch) => isOpenBatch(batch.status));
  if (open.length === 0) return null;
  return open.filter((batch) => batch.status === 'awaiting_date').length / open.length;
}

function inWeek(at: string, input: KpiInput): boolean {
  const day = at.split('T')[0];
  if (day === undefined) return false;
  const date = localDate(day);
  return diffDays(date, input.from) >= 0 && diffDays(input.to, date) >= 0;
}

function risksOf(input: KpiInput, labels: PerformanceFacts['batchLabels']): WeeklyReportData['risks'] {
  return input.batches.flatMap((batch) => riskOf({ batch, today: input.today, labels })).sort(byOverdue).slice(0, RISK_LIMIT);
}

function riskOf({ batch, today, labels }: { readonly batch: KpiInput['batches'][number]; readonly today: LocalDate; readonly labels: PerformanceFacts['batchLabels'] }): WeeklyReportData['risks'] {
  if (!isOpenBatch(batch.status) || batch.dateBuyerConfirmed === null || diffDays(today, batch.dateBuyerConfirmed) <= 0) return [];
  const label = labels[batch.id];
  if (label === undefined || label.orderLineId === null) return [];
  return [{ batchId: batch.id, orderLineId: label.orderLineId, overdueDays: diffDays(today, batch.dateBuyerConfirmed), nameRaw: label.nameRaw }];
}

function byOverdue(left: WeeklyReportData['risks'][number], right: WeeklyReportData['risks'][number]): number {
  if (left.overdueDays === null) return 1;
  if (right.overdueDays === null) return -1;
  return right.overdueDays - left.overdueDays;
}

function dueNext(input: KpiInput, labels: PerformanceFacts['batchLabels']): WeeklyReportData['dueNextWeek'] {
  const start = addDays(input.to, NEXT_WEEK_OFFSET);
  const end = addDays(start, WEEK_END_OFFSET);
  return input.batches.flatMap((batch) => {
    if (!isOpenBatch(batch.status) || batch.dateBuyerConfirmed === null) return [];
    if (diffDays(batch.dateBuyerConfirmed, start) < 0 || diffDays(end, batch.dateBuyerConfirmed) < 0) return [];
    return [{ batchId: batch.id, dueDate: batch.dateBuyerConfirmed, nameRaw: labels[batch.id]?.nameRaw ?? null }];
  });
}

function distributionOf(input: KpiInput): WeeklyReportData['stuck'] {
  const table = stuckDistribution(input.batches, input.today);
  return BATCH_STATUSES.flatMap((stage) => {
    const row = table[stage];
    return row === undefined ? [] : [{ stage, buckets: bucketsOf(row) }];
  });
}

function bucketsOf(row: Record<string, number>): WeeklyReportData['stuck'][number]['buckets'] {
  return { '0-3': count(row, '0-3'), '4-7': count(row, '4-7'), '8-14': count(row, '8-14'), '15+': count(row, '15+') };
}

function count(row: Record<string, number>, key: string): number {
  const value = row[key];
  return value === undefined ? 0 : value;
}

function supplierRows(input: KpiInput, names: Readonly<Record<string, string>>): SupplierKpiRow[] {
  return scopedSupplierIds(input).map((partyId) => supplierRow({ input, partyId, displayName: names[partyId] ?? null }));
}

function supplierRow(row: { readonly input: KpiInput; readonly partyId: string; readonly displayName: string | null }): SupplierKpiRow {
  const scoped = { ...row.input, batches: row.input.batches.filter((batch) => batch.supplierPartyId === row.partyId) };
  return {
    partyId: row.partyId,
    displayName: row.displayName,
    dueBatches: figure(dueBatches(scoped)),
    onTime: figure(onTimeRate(scoped)),
    averageDelayDays: figure(averageDelay(scoped)),
    overdueNow: figure(currentlyOverdue(scoped)),
    noteReturnDays: figure(noteReturnDays(scoped)),
    ...supplierEventFigures(row.input, { partyId: row.partyId }),
    weekly: weeklyOnTime(scoped).map(weekPoint),
  };
}

function buyerRows(input: KpiInput, facts: PerformanceFacts): BuyerLoadRow[] {
  return buyerLoads(input, facts.followUps).map((load) => ({
    buyer: { id: load.buyerUserId, name: facts.buyerNames[load.buyerUserId] ?? null },
    openLines: load.openLines,
    openBatches: load.openBatches,
    overdue: load.overdue,
    dueToday: load.dueToday,
    missingDate: load.missingDate,
    openExceptions: load.openExceptions,
    followUpsInPeriod: load.followUps,
  }));
}

function weekPoint(point: { readonly weekStart: LocalDate; readonly rate: KpiMeasure }): SupplierWeek {
  return { weekStart: point.weekStart, rate: point.rate.value, n: point.rate.n };
}

function figure(measure: KpiMeasure): SupplierKpiRow['dueBatches'] {
  return { numerator: measure.numerator, denominator: measure.denominator, n: measure.n };
}
