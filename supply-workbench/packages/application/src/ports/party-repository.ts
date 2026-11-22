import type { Party } from '@sw/domain';

export interface PartyRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<Party>;
  /** 找不到返回 undefined。 */
  find(id: string): Promise<Party | undefined>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: Party): Promise<void>;
}
