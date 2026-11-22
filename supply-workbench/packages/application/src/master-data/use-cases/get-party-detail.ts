import {
  averageDelay,
  currentlyOverdue,
  dateChangeCount,
  dueBatches,
  noteReturnDays,
  onTimeRate,
  openExceptionCount,
  type KpiInput,
  type KpiMeasure,
} from '@sw/domain';
import type { GetPartyDetail, GetPartyDetailDeps } from '../boundary.js';
import type { KpiFigure, KpiFigures } from '../views.js';

export const makeGetPartyDetail =
  (deps: GetPartyDetailDeps): GetPartyDetail =>
  async (input) => {
    const detail = await deps.master.getParty(input);
    const loaded = await deps.master.loadPartyKpi(input);
    const kpi = { ...loaded, from: input.from ?? loaded.from, to: input.to ?? loaded.to };
    return { ...detail, kpis: figuresOf(kpi), kpiWindow: { from: kpi.from, to: kpi.to } };
  };

function figuresOf(input: KpiInput): KpiFigures {
  return {
    dueBatches: figure(dueBatches(input)),
    onTime: figure(onTimeRate(input)),
    averageDelayDays: figure(averageDelay(input)),
    overdueNow: figure(currentlyOverdue(input)),
    dateChanges: figure(dateChangeCount(input)),
    noteReturnDays: figure(noteReturnDays(input)),
    openExceptions: figure(openExceptionCount(input)),
  };
}

function figure(measure: KpiMeasure): KpiFigure {
  return { numerator: measure.numerator, denominator: measure.denominator, n: measure.n };
}
