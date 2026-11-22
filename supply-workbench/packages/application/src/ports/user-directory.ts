import type { Actor } from '../shared/actor.js';

export interface UserDirectory {
  /** 找不到或已停用返回 undefined。 */
  findActive(id: string): Promise<Actor | undefined>;
  /** 按飞书应用内 open_id 找活动用户。 */
  findActiveByFeishuOpenId(openId: string): Promise<Actor | undefined>;
  listDevLoginUsers(): Promise<readonly Actor[]>;
}
