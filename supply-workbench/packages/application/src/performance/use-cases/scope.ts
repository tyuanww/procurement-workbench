import type { KpiBatch, KpiInput, Lane, OrderLineLoad } from '@sw/domain';
import type { PerformanceFacts, PerformanceReadModel } from '../../ports/performance-read-model.js';
import type { PeriodQuery } from '../views.js';

export async function loadScoped(performance: PerformanceReadModel, input: PeriodQuery & { readonly includeBatchDelivery?: boolean }): Promise<PerformanceFacts> {
  const { includeBatchDelivery: shouldIncludeBatchDelivery = false, ...query } = input;
  const facts = await performance.load(query, { includeBatchDelivery: shouldIncludeBatchDelivery });
  return {
    ...facts,
    kpi: {
      ...facts.kpi,
      from: query.from,
      to: query.to,
      batches: byLane(facts.kpi.batches, query.lane),
      lines: byLaneLines(facts.kpi.lines, query.lane),
    },
  };
}

function byLane(batches: readonly KpiBatch[], lane: Lane | undefined): readonly KpiBatch[] {
  if (lane === undefined) return batches;
  return batches.filter((batch) => batch.lane === lane);
}

function byLaneLines(lines: readonly OrderLineLoad[], lane: Lane | undefined): readonly OrderLineLoad[] {
  if (lane === undefined) return lines;
  return lines.filter((line) => line.lane === lane);
}

export function scopedBatches(kpi: KpiInput, partyId: string): KpiInput {
  return { ...kpi, batches: kpi.batches.filter((batch) => batch.supplierPartyId === partyId) };
}
