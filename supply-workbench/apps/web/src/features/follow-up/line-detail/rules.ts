import { batchStatusLabel, timelineKindLabel, type BatchStatus, type TimelineKind } from '@sw/domain';
import type { FulfillmentEvidence } from '@sw/domain';
import { formatDateTime } from '../../../shared/ui/format.js';

export function dateChangeNeedsReason(input: { readonly hadDate: boolean; readonly reason: string }): boolean {
  return input.hadDate && input.reason.trim() === '';
}

export function missingDeliveredText(): string {
  return '代工厂表无对应记录';
}

export function adoptShipmentPrefill(row: { readonly qty: number | null; readonly shippedOn: string | null }): { readonly qty: number | null; readonly shippedOn: string | null } {
  return { qty: row.qty, shippedOn: row.shippedOn };
}

export function buyerUndo(previous: string | null, next: string | null): { readonly canUndo: boolean; readonly label: string } {
  return { canUndo: previous !== next, label: previous === null ? '撤销分配' : `撤销，改回 ${previous}` };
}

export function batchLineText(batch: { readonly seq: number; readonly status: BatchStatus; readonly dateBuyerConfirmed: string | null }): string {
  return `${batch.seq} · ${batchStatusLabel(batch.status)} · 确认 ${batch.dateBuyerConfirmed ?? '未设'}`;
}

const UNREADABLE_TIME = '时间无法识别';

export function timelineLineText(event: { readonly kind: TimelineKind; readonly voided: boolean; readonly at: string; readonly fulfillment?: FulfillmentEvidence | null }): string {
  const label = event.fulfillment?.kind === 'reported' ? '工厂报发' : timelineKindLabel(event.kind);
  if (event.voided) return `${label} 已作废`;
  return `${label} ${formatDateTime(event.at) ?? UNREADABLE_TIME}`;
}

