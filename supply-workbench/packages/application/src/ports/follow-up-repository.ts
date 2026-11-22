import type { FollowUp } from '@sw/domain';

export interface FollowUpRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<FollowUp>;
  /** 找不到返回 undefined。 */
  find(id: string): Promise<FollowUp | undefined>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: FollowUp): Promise<void>;
  /** 撤销时删掉。找不到就抛 NotFoundError。 */
  remove(id: string): Promise<void>;
}
