import { ROLES, type EntityId, type Role } from '@sw/domain';
import type { Actor } from '../../../application/src/shared/actor.js';
import type { UserDirectory } from '../../../application/src/ports/user-directory.js';
import type { AppDatabase } from '../client.js';
import { userRepository } from './users.js';
import { eq } from 'drizzle-orm';
import { users } from '../schema/platform.js';
import { entityId } from '../mappers/id.js';

export function userDirectory(db: AppDatabase): UserDirectory {
  const directoryUsers = userRepository(db);
  return {
    async findActive(id) {
      const user = await directoryUsers.find(id);
      if (user === undefined || !user.active) return undefined;
      return actorOf(user);
    },
    async findActiveByFeishuOpenId(openId) {
      const row = (await db.select().from(users).where(eq(users.feishuOpenId, openId)))[0];
      if (row === undefined || !row.active) return undefined;
      return actorOf({ id: entityId(row.id), name: row.name, roles: rolesOf(row.roles) });
    },
    async listDevLoginUsers() {
      return (await directoryUsers.list()).filter((user) => user.active).map(actorOf);
    },
  };
}

function actorOf(user: { readonly id: EntityId; readonly name: string; readonly roles: Actor['roles'] }): Actor {
  return { id: user.id, name: user.name, roles: user.roles };
}

function rolesOf(values: readonly string[]): readonly Role[] {
  const roles: Role[] = [];
  for (const value of values) {
    for (const role of ROLES) {
      if (value === role) roles.push(role);
    }
  }
  return roles;
}
