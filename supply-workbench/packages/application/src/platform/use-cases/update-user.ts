import type { UpdateUser, UpdateUserDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';

export const makeUpdateUser =
  (deps: UpdateUserDeps): UpdateUser =>
  async (input, actor) => {
    authorize(actor, 'admin');
    if (input.name !== undefined) trimmedName(input.name);
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const before = await tx.users.get(input.userId);
      const after = {
        ...before,
        name: input.name === undefined ? before.name : trimmedName(input.name),
        roles: input.roles === undefined ? before.roles : input.roles,
        active: input.active === undefined ? before.active : input.active,
        updatedAt: at,
      };
      await tx.users.save(after);
      await tx.audit.record(auditOf({ action: 'user.update', subject: after, ctx: { actor, at, before, after } }));
    });
    return { userId: input.userId };
  };

function trimmedName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new ValidationFailedError('姓名不能为空', { field: 'name' });
  return trimmed;
}
