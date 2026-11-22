import { SCHEDULE_LINK_REVIEW } from '@sw/domain';
import type { FactoryRowMatchRef, OrderLineMatchRef } from './views.js';
import { matchFactoryRow } from './matching.js';

export { SCHEDULE_LINK_REVIEW };

export type ScheduleDecision =
  | { readonly kind: 'skip' }
  | { readonly kind: 'keep'; readonly lineId: string; readonly reason: typeof SCHEDULE_LINK_REVIEW }
  | { readonly kind: 'write'; readonly status: 'linked'; readonly lineId: string; readonly reason: null }
  | { readonly kind: 'write'; readonly status: 'unlinked' | 'ambiguous'; readonly lineId: null; readonly reason: string };

/** 排产格各自匹配。已自动关联的格子不改订单行；对不上时只加待复核。 */
export function planScheduleCell(row: FactoryRowMatchRef, lines: readonly OrderLineMatchRef[]): ScheduleDecision {
  if (row.linkStatus === 'manual') return { kind: 'skip' };
  const match = matchFactoryRow(row, lines);
  if (row.linkStatus === 'linked' && row.linkedOrderLineId !== null) return keepLinked(row.linkedOrderLineId, match);
  if (match.kind === 'matched') return { kind: 'write', status: 'linked', lineId: match.line.orderLineId, reason: null };
  if (match.kind === 'conflict') return { kind: 'write', status: 'ambiguous', lineId: null, reason: 'FACTORY_LINK_CONFLICT' };
  return { kind: 'write', status: 'unlinked', lineId: null, reason: 'NO_CANDIDATE_LINE' };
}

function keepLinked(lineId: string, match: ReturnType<typeof matchFactoryRow>): ScheduleDecision {
  if (match.kind === 'matched' && match.line.orderLineId === lineId) return { kind: 'write', status: 'linked', lineId, reason: null };
  return { kind: 'keep', lineId, reason: SCHEDULE_LINK_REVIEW };
}
