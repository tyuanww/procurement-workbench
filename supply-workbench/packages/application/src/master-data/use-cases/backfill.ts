import type { EntityId } from '@sw/domain';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';

export async function backfillSupplier(tx: UnitOfWorkStores, input: { readonly normName: string; readonly partyId: EntityId; readonly at: string }): Promise<string[]> {
  const orderIds = await tx.purchaseOrders.backfillMissingSupplier(input);
  const lineIds: string[] = [];
  for (const orderId of orderIds) {
    const lines = await tx.orderLines.listByPurchaseOrder(orderId);
    for (const line of lines) lineIds.push(line.id);
  }
  return lineIds;
}

export async function backfillItem(tx: UnitOfWorkStores, input: { readonly codeNorm: string; readonly itemId: EntityId; readonly at: string }): Promise<string[]> {
  const lines = await tx.orderLines.listByCodeNorm(input.codeNorm);
  const changed: string[] = [];
  for (const line of lines) {
    if (line.itemId !== null) continue;
    await tx.orderLines.save({ ...line, itemId: input.itemId, updatedAt: input.at });
    changed.push(line.id);
  }
  return changed;
}
