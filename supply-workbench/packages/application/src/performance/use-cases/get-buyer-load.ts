import { buyerLoads, unassignedOpenExceptionCount, type BuyerLoad, type Lane } from '@sw/domain';
import type { GetBuyerLoad, GetBuyerLoadDeps } from '../boundary.js';
import type { BuyerLoadRow, NamedPerson } from '../views.js';
import { loadScoped } from './scope.js';
import { authorize } from '../../shared/authorize.js';

export const makeGetBuyerLoad =
  (deps: GetBuyerLoadDeps): GetBuyerLoad =>
  async (input, actor) => {
    authorize(actor, 'dashboard.read');
    const facts = await loadScoped(deps.performance, input);
    const followUps = input.lane === undefined ? facts.followUps : [];
    return {
      rows: buyerLoads(facts.kpi, followUps).map((load) => toRow({ load, names: facts.buyerNames, lane: input.lane })),
      unassignedExceptions: input.lane === undefined ? unassignedOpenExceptionCount(facts.kpi) : null,
    };
  };

function toRow({ load, names, lane }: { readonly load: BuyerLoad; readonly names: Readonly<Record<string, string>>; readonly lane: Lane | undefined }): BuyerLoadRow {
  return {
    buyer: person(load.buyerUserId, names),
    openLines: load.openLines,
    openBatches: load.openBatches,
    overdue: load.overdue,
    dueToday: load.dueToday,
    missingDate: load.missingDate,
    openExceptions: lane === undefined ? load.openExceptions : null,
    followUpsInPeriod: lane === undefined ? load.followUps : null,
  };
}

function person(id: string, names: Readonly<Record<string, string>>): NamedPerson {
  return { id, name: names[id] ?? null };
}
