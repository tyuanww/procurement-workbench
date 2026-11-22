import { normalizeUnit, type LineStage } from '@sw/domain';

type FirstBatchLine = {
  readonly qtyOrdered: number | null;
  readonly unit: string | null;
  readonly receiverPartyId: string | null;
};

type MissingField = 'quantity' | 'unit' | 'receiver';

export function firstBatchReadiness<PartyId extends string>({ line, warehouseId }: {
  readonly line: FirstBatchLine;
  readonly warehouseId: PartyId | null;
}): { readonly kind: 'create'; readonly qty: number; readonly unit: string; readonly receiver: PartyId }
  | { readonly kind: 'detail'; readonly missingFields: readonly MissingField[] } {
  const qty = usableQuantity(line.qtyOrdered);
  const unit = normalizeUnit(line.unit);
  if (qty !== null && unit !== null && warehouseId !== null && line.receiverPartyId === warehouseId) {
    return { kind: 'create', qty, unit, receiver: warehouseId };
  }
  const missingFields: MissingField[] = [];
  if (qty === null) missingFields.push('quantity');
  if (unit === null) missingFields.push('unit');
  if (line.receiverPartyId === null) missingFields.push('receiver');
  return { kind: 'detail', missingFields };
}

function usableQuantity(qty: number | null): number | null {
  return qty !== null && Number.isFinite(qty) && qty > 0 ? qty : null;
}

export function isOpenForFirstBatch(line: { readonly stage: LineStage; readonly cancelledAt: string | null }, reportedStatus: string | null): boolean {
  return line.cancelledAt === null && line.stage !== 'cancelled' && line.stage !== 'done'
    && reportedStatus !== '已完成' && reportedStatus !== '已取消';
}
