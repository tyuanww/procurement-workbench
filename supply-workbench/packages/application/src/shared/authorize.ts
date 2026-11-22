import { can, type PermissionAction } from '@sw/domain';
import type { Actor } from './actor.js';
import { ForbiddenError } from './errors.js';

export function authorize(actor: Actor, action: PermissionAction): void {
  if (!can(actor, action)) throw new ForbiddenError(action);
}
