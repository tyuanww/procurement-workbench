import { isCurrentlyOverdue, type EntityId, type Lane, type LocalDate } from '@sw/domain';
import type { PerformanceReadModel } from '../../ports/performance-read-model.js';
import type { Actor } from '../../shared/actor.js';
import { authorize } from '../../shared/authorize.js';
import { loadScoped } from './scope.js';

export type BuyerDrillQuery =
  | { readonly kind: 'overdue'; readonly buyerId: EntityId; readonly lane?: Lane }
  | { readonly kind: 'unassigned-exceptions' };

export type UnassignedExceptionItem = {
  readonly id: string;
  readonly orderLineId: string;
  readonly batchId: string | null;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly note: string;
};

type OverdueBatch = {
  readonly id: string;
  readonly orderLineId: string | null;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly confirmedOn: LocalDate | null;
};

export type BuyerDrillView =
  | { readonly kind: 'overdue'; readonly items: readonly OverdueBatch[] }
  | { readonly kind: 'unassigned-exceptions'; readonly items: readonly UnassignedExceptionItem[] };

type Deps = {
  readonly performance: PerformanceReadModel;
  readonly clock: { today(): LocalDate };
  readonly readUnassignedExceptions: () => Promise<readonly UnassignedExceptionItem[]>;
};

export function makeGetBuyerDrill(deps: Deps): (input: BuyerDrillQuery, actor: Actor) => Promise<BuyerDrillView> {
  return async (input, actor) => {
    authorize(actor, 'dashboard.read');
    if (input.kind === 'unassigned-exceptions') {
      return { kind: input.kind, items: await deps.readUnassignedExceptions() };
    }
    const today = deps.clock.today();
    const { kpi, batchLabels } = await loadScoped(deps.performance, {
      from: today, to: today, ...(input.lane === undefined ? {} : { lane: input.lane }),
    });
    const items = kpi.batches
      .filter((batch) => batch.buyerUserId === input.buyerId && isCurrentlyOverdue(batch, kpi.today))
      .map((batch) => ({
        id: batch.id,
        orderLineId: batchLabels[batch.id]?.orderLineId ?? null,
        poRaw: batchLabels[batch.id]?.poRaw ?? null,
        nameRaw: batchLabels[batch.id]?.nameRaw ?? null,
        confirmedOn: batch.dateBuyerConfirmed,
      }))
      .sort((left, right) => (left.confirmedOn ?? '').localeCompare(right.confirmedOn ?? '') || left.id.localeCompare(right.id));
    return { kind: input.kind, items };
  };
}
