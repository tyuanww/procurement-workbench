import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { ValidationFailedError } from '../../shared/errors.js';

type LineRef = {
  readonly orderLineId: string;
  readonly batchId?: string;
  readonly partyId?: string;
};

export async function assertLineRefs(tx: UnitOfWorkStores, input: LineRef): Promise<void> {
  await tx.orderLines.get(input.orderLineId);
  if (input.batchId !== undefined) await assertBatchOnLine({ tx, orderLineId: input.orderLineId, batchId: input.batchId });
  if (input.partyId !== undefined) await tx.parties.get(input.partyId);
}

export function requiredText(value: string, field: string): string {
  const text = value.trim();
  if (text === '') throw new ValidationFailedError('不能为空', { field });
  return text;
}

async function assertBatchOnLine({ tx, orderLineId, batchId }: { readonly tx: UnitOfWorkStores; readonly orderLineId: string; readonly batchId: string }): Promise<void> {
  const batch = await tx.batches.get(batchId);
  if (batch.orderLineId !== orderLineId) {
    throw new ValidationFailedError('批次不属于这条订单行', { field: 'batchId' });
  }
}
