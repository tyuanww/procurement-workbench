import {
  averageDelay,
  currentlyOverdue,
  dueBatches,
  noteReturnDays,
  onTimeRate,
  onTimeBatchResults,
  weeklyOnTime,
  type KpiInput,
  type Lane,
} from '@sw/domain';
import type { GetSupplierPerformance, GetSupplierPerformanceDeps } from '../boundary.js';
import type { PerformanceFacts } from '../../ports/performance-read-model.js';
import type { SupplierBatchResult, SupplierKpiRow, SupplierWeek } from '../views.js';
import { figure } from './figures.js';
import { loadScoped, scopedBatches } from './scope.js';
import { authorize } from '../../shared/authorize.js';
import { scopedSupplierIds, supplierEvents, supplierEventFigures } from '../supplier-events.js';

export const makeGetSupplierPerformance =
  (deps: GetSupplierPerformanceDeps): GetSupplierPerformance =>
  async (input, actor) => {
    authorize(actor, 'dashboard.read');
    const facts = await loadScoped(deps.performance, input);
    if (input.partyId !== undefined) return { rows: [], detail: detailOf(facts, input.partyId) };
    return {
      rows: scopedSupplierIds(facts.kpi, input.lane).map((partyId) => rowOf({ facts, partyId, lane: input.lane })),
      unassigned: supplierEvents(facts.kpi, { partyId: null, lane: input.lane }),
    };
  };

function rowOf({ facts, partyId, lane }: { readonly facts: PerformanceFacts; readonly partyId: string; readonly lane: Lane | undefined }): SupplierKpiRow {
  const scoped = scopedBatches(facts.kpi, partyId);
  return {
    partyId,
    displayName: facts.partyNames[partyId] ?? null,
    ...batchMetrics(scoped),
    ...supplierEventFigures(facts.kpi, { partyId, lane }),
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

function detailOf(facts: PerformanceFacts, partyId: string): SupplierBatchResult[] {
  return onTimeBatchResults(scopedBatches(facts.kpi, partyId)).map(({ batch, onTime, lastReceivedOn }) => {
    const label = facts.batchLabels[batch.id];
    return {
      batchId: batch.id, orderLineId: label?.orderLineId ?? null,
      poRaw: label?.poRaw ?? null, nameRaw: label?.nameRaw ?? null,
      firstConfirmedDate: batch.firstConfirmedDate, lastReceivedOn, onTime,
    };
  });
}

function weeksOf(kpi: KpiInput): SupplierWeek[] {
  return weeklyOnTime(kpi).map((point) => ({ weekStart: point.weekStart, rate: point.rate.value, n: point.rate.n }));
}
