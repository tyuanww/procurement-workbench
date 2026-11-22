import type { UserRepository } from '../../ports/user-repository.js';
import { authorize } from '../../shared/authorize.js';
import { isOwnerAccount } from '../../shared/owner-assignment.js';
import type { ListLineOwners } from '../boundary.js';

export function makeListLineOwners(users: UserRepository): ListLineOwners {
  return async (actor) => {
    authorize(actor, 'lines.write');
    return (await users.list()).filter(isOwnerAccount).map(({ id, name }) => ({ id, name }));
  };
}
