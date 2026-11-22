import type { User } from '@sw/domain';

export interface UserRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<User>;
  /** 找不到返回 undefined。 */
  find(id: string): Promise<User | undefined>;
  /** 管理列表。停用用户也在里面。 */
  list(): Promise<readonly User[]>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: User): Promise<void>;
}
