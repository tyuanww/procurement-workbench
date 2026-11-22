import type { LineStage, PurchaseScope } from '../vocabulary/index.js';
import { matchChannel, type ChannelProduct } from './channel.js';

const OPEN_REPORTED = new Set(['进行中', '未开始']);
const OPEN_STAGES = new Set<LineStage>(['awaiting_date', 'awaiting_shipment', 'awaiting_receipt', 'partially_received']);

export type PurchaseLine = {
  readonly barcodeRaw: string;
  readonly reportedStatus: string;
  readonly stage: LineStage;
};

export function countOpenPurchaseLines({ lines, product, scope }: { readonly lines: readonly PurchaseLine[]; readonly product: ChannelProduct; readonly scope: PurchaseScope }): number {
  return lines.filter((line) => inScope({ line, product, scope }) && isOpen(line)).length;
}

export function purchaseDistribution({ lines, product, scope }: { readonly lines: readonly PurchaseLine[]; readonly product: ChannelProduct; readonly scope: PurchaseScope }): {
  readonly byStage: Record<LineStage, number>;
  readonly byReportedStatus: Record<string, number>;
} {
  const matched = lines.filter((line) => inScope({ line, product, scope }));
  return { byStage: stagesOf(matched), byReportedStatus: reportedOf(matched) };
}

function inScope({ line, product, scope }: { readonly line: PurchaseLine; readonly product: ChannelProduct; readonly scope: PurchaseScope }): boolean {
  return matchChannel({ lineBarcode: line.barcodeRaw, product, scope }) !== null;
}

function isOpen(line: PurchaseLine): boolean {
  if (OPEN_REPORTED.has(line.reportedStatus)) return true;
  return line.stage !== 'no_batch' && OPEN_STAGES.has(line.stage);
}

function stagesOf(lines: readonly PurchaseLine[]): Record<LineStage, number> {
  const counts = emptyStages();
  for (const line of lines) counts[line.stage] += 1;
  return counts;
}

function emptyStages(): Record<LineStage, number> {
  return {
    no_batch: 0,
    awaiting_date: 0,
    awaiting_shipment: 0,
    awaiting_receipt: 0,
    partially_received: 0,
    done: 0,
    cancelled: 0,
  };
}

function reportedOf(lines: readonly PurchaseLine[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of lines) counts[line.reportedStatus] = bumped(counts[line.reportedStatus]);
  return counts;
}

function bumped(current: number | undefined): number {
  return current === undefined ? 1 : current + 1;
}
