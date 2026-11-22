import type { PartyAlias } from '@sw/domain';

export interface PartyAliasRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<PartyAlias>;
  /** 找不到返回 undefined。 */
  find(id: string): Promise<PartyAlias | undefined>;
  findByNormName(normName: string): Promise<PartyAlias | undefined>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: PartyAlias): Promise<void>;
}
