import { isOpenWorkItemStatus, type WorkItemStatus } from '../../../domain/src/entities/work-items.js';
import type { DevelopmentNode } from '../ports/product-development.js';
import type { Actor } from '../shared/actor.js';
import { isDevelopmentBuyer } from './access.js';

export function canReplyToDevelopment(node: DevelopmentNode & { readonly status: WorkItemStatus }, actor: Actor): boolean {
  return node.formalLink === null && isOpenWorkItemStatus(node.status) && node.buyerUserId === actor.id && isDevelopmentBuyer(actor);
}

export function developmentReplyDate(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null || !('promisedOn' in value)) return undefined;
  return typeof value.promisedOn === 'string' ? value.promisedOn : undefined;
}
