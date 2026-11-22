import {
  averageDelay,
  currentlyOverdue,
  dateChangeCount,
  dueBatches,
  noteReturnDays,
  onTimeRate,
  openExceptionCount,
  weeklyOnTime,
  type KpiBatch,
  type KpiInput,
  type Lane,
} from '@sw/domain';
import type { GetSupplierPerformance, GetSupplierPerformanceDeps } from '../boundary.js';
import type { PerformanceFacts } from '../../ports/performance-read-model.js';
import type { SupplierKpiRow, SupplierWeek } from '../views.js';
import { figure, unattributed } from './figures.js';
import { loadScoped, scopedBatches } from './scope.js';
import { authorize } from '../../shared/authorize.js';

export const makeGetSupplierPerformance =
  (deps: GetSupplierPerformanceDeps): GetSupplierPerformance =>
  async (input, actor) => {
    authorize(actor, 'dashboard.read');
    const facts = await loadScoped(deps.performance, input);
    // 02 第 9 节还写了只统计等待供应商、收货方另列。D04 没有这两个过滤，行类型也没有收货方块。验收要求与 D04 一致，这里不另写一套。
    return { rows: supplierIds(facts.kpi.batches).map((partyId) => rowOf({ facts, partyId, lane: input.lane })) };
  };

function rowOf({ facts, partyId, lane }: { readonly facts: PerformanceFacts; readonly partyId: string; readonly lane: Lane | undefined }): SupplierKpiRow {
  const scoped = scopedBatches(facts.kpi, partyId);
  return {
    partyId,
    displayName: facts.partyNames[partyId] ?? null,
    ...batchMetrics(scoped),
    ...periodMetrics(facts.kpi, lane),
    weekly: weeksOf(scoped),
  };
}

function batchMetrics(kpi: KpiInput): Pick<SupplierKpiRow, 'dueBatches' | 'onTime' | 'averageDelayDays' | 'overdueNow' | 'noteReturnDays'> {
  return {
    dueBatches: figure(dueBatches(kpi)),
    onTime: figure(onTimeRate(kpi)),
    averageDelayDays: figure(averageDelay(kpi)),
    overdueNow: figure(currentlyOverdue(kpi)),
    noteReturnDays: figure(noteReturnDays(kpi)),
  };
}

function periodMetrics(kpi: KpiInput, lane: Lane | undefined): Pick<SupplierKpiRow, 'dateChanges' | 'openExceptions'> {
  if (lane !== undefined || !sharesOneSupplier(kpi.batches)) return { dateChanges: unattributed(), openExceptions: unattributed() };
  return { dateChanges: figure(dateChangeCount(kpi)), openExceptions: figure(openExceptionCount(kpi)) };
}

function weeksOf(kpi: KpiInput): SupplierWeek[] {
  return weeklyOnTime(kpi).map((point) => ({ weekStart: point.weekStart, rate: point.rate.value, n: point.rate.n }));
}

function supplierIds(batches: readonly KpiBatch[]): string[] {
  return [...new Set(batches.flatMap((batch) => (batch.supplierPartyId === null ? [] : [batch.supplierPartyId])))].sort();
}

function sharesOneSupplier(batches: readonly KpiBatch[]): boolean {
  const ids = new Set(batches.map((batch) => batch.supplierPartyId));
  return ids.size === 1 && !ids.has(null);
}
