import { can, type User } from '@sw/domain';
import type { DevelopmentProject, DevelopmentStores } from '../ports/product-development.js';
import type { Actor } from '../shared/actor.js';
import { ForbiddenError, ValidationFailedError } from '../shared/errors.js';

export function canLeadDevelopment(actor: Actor): boolean {
  return can(actor, 'products.maintain') || actor.roles.includes('buyer');
}

export function canManageDevelopment(project: Pick<DevelopmentProject, 'createdBy' | 'productLeadUserId'>, actor: Actor): boolean {
  return (project.createdBy === actor.id && can(actor, 'products.maintain')) ||
    (project.productLeadUserId === actor.id && canLeadDevelopment(actor)) ||
    can(actor, 'admin');
}

export function requireDevelopmentManagement(project: DevelopmentProject, actor: Actor): void {
  if (!canManageDevelopment(project, actor)) throw new ForbiddenError('product-development.manage');
}

export async function requireDevelopmentUser(store: DevelopmentStores['users'], { id, accepts, roleLabel }: { readonly id: string; readonly accepts: (user: User) => boolean; readonly roleLabel: string }): Promise<void> {
  const user = await store.find(id);
  if (user?.active !== true || !accepts(user)) throw new ValidationFailedError(`请选择启用的${roleLabel}账号`);
}

export function isDevelopmentBuyer(actor: Actor): boolean {
  return actor.roles.includes('buyer');
}
