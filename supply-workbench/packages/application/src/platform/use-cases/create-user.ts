import type { EntityId, User } from '@sw/domain';
import type { CreateUser, CreateUserDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';

export const makeCreateUser =
  (deps: CreateUserDeps): CreateUser =>
  async (input, actor) => {
    authorize(actor, 'admin');
    const name = trimmedName(input.name);
    const at = deps.clock.now();
    const userId = deps.ids.next();
    await deps.uow.run(async (tx) => {
      const user = newUser({ id: userId, name, roles: input.roles, at });
      await tx.users.save(user);
      await tx.audit.record(auditOf({ action: 'user.create', subject: user, ctx: { actor, at } }));
    });
    return { userId };
  };

function newUser(input: { readonly id: EntityId; readonly name: string; readonly roles: User['roles']; readonly at: string }): User {
  return { id: input.id, createdAt: input.at, updatedAt: input.at, name: input.name, roles: input.roles, feishuOpenId: null, active: true };
}

function trimmedName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new ValidationFailedError('姓名不能为空', { field: 'name' });
  return trimmed;
}
