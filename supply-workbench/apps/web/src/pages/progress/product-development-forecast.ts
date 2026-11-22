import type { ProductDevelopmentNode } from '@sw/contracts';
import { diffDays } from '@sw/domain';

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
