import { eq } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import { ROLES, type Role, type User } from '@sw/domain';
import type { UserRepository } from '../../../application/src/ports/user-repository.js';
import type { AppDatabase } from '../client.js';
import { users } from '../schema/platform.js';
import { entityId } from '../mappers/id.js';

export function userRepository(db: AppDatabase): UserRepository {
  return {
    async get(id) {
      const found = await findUser(db, id);
      if (found === undefined) throw new NotFoundError('用户', id);
      return found;
    },
    find: (id) => findUser(db, id),
    async list() {
      return (await db.select().from(users)).map(userOfRow);
    },
    async save(entity) {
      await db.insert(users).values(toRow(entity)).onConflictDoUpdate({ target: users.id, set: toRow(entity) });
    },
  };
}

async function findUser(db: AppDatabase, id: string): Promise<User | undefined> {
  const row = (await db.select().from(users).where(eq(users.id, id)))[0];
  return row === undefined ? undefined : userOfRow(row);
}

export function userOfRow(row: typeof users.$inferSelect): User {
  return {
    id: entityId(row.id),
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    name: row.name,
    roles: row.roles.filter(isRole),
    feishuOpenId: row.feishuOpenId,
    active: row.active,
  };
}

function toRow(entity: User): typeof users.$inferInsert {
  return { ...entity, roles: [...entity.roles] };
}

function instant(value: string): string {
  return new Date(value).toISOString();
}

function isRole(value: string): value is Role {
  for (const role of ROLES) if (role === value) return true;
  return false;
}
