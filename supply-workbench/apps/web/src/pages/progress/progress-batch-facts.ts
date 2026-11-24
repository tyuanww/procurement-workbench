import type { OrderLineRow, TodayResponse, TodoItemView } from '@sw/contracts';
import { isOpenBatch } from '@sw/domain';

type ArrivalMemo = TodayResponse['arrivalMemos'][number];
type Batch = NonNullable<TodoItemView['batch']>;
type ActionBatch = { readonly lineId: string; readonly batch: Batch };

export type StoreBatchFacts = {
  readonly seq: number | null;
  readonly unit: string;
  readonly unshippedQty: number | null;
  readonly inTransitQty: number | null;
  readonly receivedQty: number | null;
};

export function storeBatchFacts(lines: readonly Pick<OrderLineRow, 'id' | 'nextDue'>[], source: Pick<TodayResponse, 'items' | 'arrivalMemos'>): ReadonlyMap<string, StoreBatchFacts> {
  const actions = new Map(source.items.flatMap(({ line, batch, refs }) => {
    const lineId = line?.id ?? refs.orderLineId;
    return lineId === undefined || batch === null ? [] : [[batch.id, { lineId, batch }] as const];
  }));
  const memos = new Map(source.arrivalMemos.map((memo) => [memo.batchId, memo]));
  return new Map(lines.flatMap(({ id, nextDue }) => {
    if (nextDue === null) return [];
    const facts = forNextBatch({ id, nextDue, action: actions.get(nextDue.batchId), memo: memos.get(nextDue.batchId) });
    return facts === undefined ? [] : [[id, facts] as const];
  }));
}

function forNextBatch({ id, nextDue, action, memo }: {
  readonly id: string;
  readonly nextDue: NonNullable<OrderLineRow['nextDue']>;
  readonly action: ActionBatch | undefined;
  readonly memo: ArrivalMemo | undefined;
}): StoreBatchFacts | undefined {
  if (action?.lineId === id) {
    const { batch } = action;
    if (batch.dateBuyerConfirmed !== nextDue.dateBuyerConfirmed || !isOpenBatch(batch.status)) return undefined;
    if (batch.fulfillment !== undefined) {
      const { unit, unshippedQty, inTransitQty, receivedQty } = batch.fulfillment;
      return unit === null ? undefined : { seq: batch.seq, unit, unshippedQty, inTransitQty, receivedQty };
    }
  }
  if (memo?.line.id !== id || memo.confirmedDate !== nextDue.dateBuyerConfirmed) return undefined;
  return { seq: memo.batchSeq, unit: memo.unit, unshippedQty: null, inTransitQty: memo.inTransitQty, receivedQty: memo.receivedQty };
}
