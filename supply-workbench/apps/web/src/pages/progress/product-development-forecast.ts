import type { ProductDevelopmentBatch, ProductDevelopmentNode } from '@sw/contracts';
import { diffDays, normalizeUnit, roundQuantity } from '@sw/domain';

type DevelopmentForecast =
  | { readonly kind: 'inactive' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'on-time' }
  | { readonly kind: 'late'; readonly days: number };

export function developmentForecast(node: Pick<ProductDevelopmentNode, 'status' | 'formalLink' | 'plannedEnd' | 'latestReply'>): DevelopmentForecast {
  if (node.status === 'done' || node.status === 'cancelled' || node.formalLink !== null) return { kind: 'inactive' };
  if (node.latestReply === null) return { kind: 'unknown' };

  const days = diffDays(node.latestReply.promisedOn, node.plannedEnd);
  return days > 0 ? { kind: 'late', days } : { kind: 'on-time' };
}

export function developmentRiskOf(node: ProductDevelopmentNode): string | null {
  const unresolved = node.batches.filter(needsReceipt);
  if (node.status === 'done' || node.status === 'cancelled') {
    return formalRisk({ unresolved, deadline: node.plannedEnd, hasUnverifiedReceipt: unresolved.length > 0 });
  }
  if (node.status === 'blocked') return '已阻塞';
  if (node.daysUntilRequired !== null && node.daysUntilRequired < 0) return `已逾期 ${-node.daysUntilRequired} 天`;
  const forecast = developmentForecast(node);
  if (forecast.kind === 'late') return `预计晚 ${forecast.days} 天`;
  return formalRisk({ unresolved, deadline: node.plannedEnd, hasUnverifiedReceipt: unresolved.some(({ status }) => status === 'received') });
}

function needsReceipt(batch: ProductDevelopmentBatch): boolean {
  return batch.status !== 'cancelled' && !hasVerifiedBatchReceipt(batch);
}

function formalRisk({ unresolved, deadline, hasUnverifiedReceipt }: {
  readonly unresolved: readonly ProductDevelopmentBatch[]; readonly deadline: ProductDevelopmentNode['plannedEnd']; readonly hasUnverifiedReceipt: boolean;
}): string | null {
  const delay = Math.max(0, ...unresolved.flatMap(({ buyerConfirmedOn }) => buyerConfirmedOn === null ? [] : [diffDays(buyerConfirmedOn, deadline)]));
  if (delay > 0) return `采购确认晚于要求 ${delay} 天`;
  return hasUnverifiedReceipt ? '正式批次实收待核实' : null;
}

export function hasVerifiedBatchReceipt({ fulfillment, plannedQty, receiptDates, status }: ProductDevelopmentBatch): boolean {
  if ((status !== 'received' && status !== 'closed') || plannedQty === undefined || !receiptDates?.length || normalizeUnit(fulfillment.unit) === null) return false;
  const plan = roundQuantity(plannedQty);
  return plan > 0 && fulfillment.receivedQty !== null && fulfillment.receivedQty >= plan && fulfillment.verifiedReceivedQty >= plan;
}

export function needsDevelopmentReply(node: ProductDevelopmentNode): boolean {
  return node.canReply && node.latestReply === null && node.status !== 'done' && node.status !== 'cancelled';
}

export function waitingText(waiting: NonNullable<ProductDevelopmentNode['followUp']>['waiting'] | undefined): string {
  if (waiting?.kind === 'none') return '无需等待';
  if (waiting?.kind !== 'waiting') return '等待方待核对';
  return [waiting.party ?? '等待方待核对', waiting.deliverable].filter(Boolean).join(' · ');
}

export function nodeWaitingText(node: ProductDevelopmentNode): string | null {
  if (node.status === 'done' || node.status === 'cancelled') return null;
  if (node.followUp !== undefined) return waitingText(node.followUp.waiting);
  return needsDevelopmentReply(node) ? '待我回复' : node.status === 'blocked' ? '等待方待核对' : null;
}
