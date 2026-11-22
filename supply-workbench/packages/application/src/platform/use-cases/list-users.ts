import type { ListUsers, ListUsersDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

export const makeListUsers =
  (deps: ListUsersDeps): ListUsers =>
  async (input, actor) => {
    void input;
    authorize(actor, 'admin');
    const users = await deps.users.list();
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      roles: user.roles,
      active: user.active,
      feishuOpenId: user.feishuOpenId,
    }));
  };
