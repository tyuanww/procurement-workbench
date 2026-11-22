import type { UserRepository } from '../ports/user-repository.js';
import type { Actor } from './actor.js';

export async function activeAdminActor(users: Pick<UserRepository, 'list'>): Promise<Actor> {
  const admin = (await users.list()).find((user) => user.active && user.roles.includes('admin'));
  if (admin === undefined) throw new Error('没有在职管理员，定时任务无法记账');
  return { id: admin.id, name: admin.name, roles: admin.roles };
}
