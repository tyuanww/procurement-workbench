import { isOpenBatch, type BatchStatus } from '@sw/domain';

export type OpenBatchAction =
  | { readonly kind: 'ship'; readonly label: '登记发货' }
  | { readonly kind: 'receipt'; readonly label: '登记收货' };

const OPEN_ACTIONS: readonly OpenBatchAction[] = [
  { kind: 'ship', label: '登记发货' },
  { kind: 'receipt', label: '登记收货' },
];

export function openBatchActions(status: BatchStatus): readonly OpenBatchAction[] {
  if (!isOpenBatch(status)) return [];
  return OPEN_ACTIONS;
}

export function canAddBatch(line: { readonly cancelledAt: string | null }): boolean {
  return line.cancelledAt === null;
}

export function showsRecordEdits(status: BatchStatus): boolean {
  return status !== 'closed' && status !== 'cancelled';
}

export function voidableShipments<T extends { readonly voidedAt: string | null }>(status: BatchStatus, rows: readonly T[]): readonly T[] {
  if (!showsRecordEdits(status)) return [];
  return rows.filter((row) => row.voidedAt === null);
}
