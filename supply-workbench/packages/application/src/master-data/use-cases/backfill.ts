import { normalizeText, type EntityId, type OrderLine } from '@sw/domain';
import type { OrderLineRepository } from '../../ports/order-line-repository.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { lockOrderLines } from '../../shared/locked-order-lines.js';

export async function backfillSupplier(tx: UnitOfWorkStores, input: { readonly normName: string; readonly partyId: EntityId; readonly at: string }): Promise<string[]> {
  const orderIds = await tx.purchaseOrders.backfillMissingSupplier(input);
  const lineIds: string[] = [];
  for (const orderId of orderIds) {
    const lines = await tx.orderLines.listByPurchaseOrder(orderId);
    for (const line of lines) lineIds.push(line.id);
  }
  return lineIds;
}

export type ItemBackfill = { readonly codeNorm: string; readonly itemId: EntityId };

type OrderedItem = { readonly itemId: EntityId; readonly order: number };

export async function backfillItems(tx: UnitOfWorkStores, { items, at }: { readonly items: readonly ItemBackfill[]; readonly at: string }): Promise<string[]> {
  const byCode = new Map<string, OrderedItem>();
  items.forEach(({ codeNorm, itemId }, order) => {
    if (codeNorm !== '' && !byCode.has(codeNorm)) byCode.set(codeNorm, { itemId, order });
  });
  const candidates = await candidateLineIds(tx.orderLines, byCode);
  const changed: string[] = [];
  for (const [id, line] of await lockOrderLines(tx.orderLines, candidates)) {
    if (line.itemId !== null) continue;
    const item = matchedItem(line, byCode);
    if (item === undefined) continue;
    await tx.orderLines.save({ ...line, itemId: item.itemId, updatedAt: at });
    changed.push(id);
  }
  return changed;
}

async function candidateLineIds(lines: OrderLineRepository, byCode: ReadonlyMap<string, OrderedItem>): Promise<string[]> {
  if (byCode.size > 1 && lines.listAll !== undefined) {
    return (await lines.listAll()).flatMap((line) => line.itemId === null && matchedItem(line, byCode) !== undefined ? [line.id] : []);
  }
  const ids = new Set<string>();
  for (const code of byCode.keys()) {
    for (const line of await lines.listByCodeNorm(code)) {
      if (line.itemId === null) ids.add(line.id);
    }
  }
  return [...ids];
}

function matchedItem(line: OrderLine, byCode: ReadonlyMap<string, OrderedItem>): OrderedItem | undefined {
  const part = line.itemCodeRaw === null ? undefined : byCode.get(normalizeText(line.itemCodeRaw));
  const barcode = line.barcodeRaw === null ? undefined : byCode.get(normalizeText(line.barcodeRaw));
  if (part === undefined) return barcode;
  if (barcode === undefined) return part;
  return part.order < barcode.order ? part : barcode;
}
