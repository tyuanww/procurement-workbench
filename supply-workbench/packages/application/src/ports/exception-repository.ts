import type { ExceptionRecord } from '@sw/domain';

export interface ExceptionRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<ExceptionRecord>;
  /** 找不到返回 undefined。 */
  find(id: string): Promise<ExceptionRecord | undefined>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: ExceptionRecord): Promise<void>;
  /** 撤销时删掉。找不到就抛 NotFoundError。 */
  remove(id: string): Promise<void>;
}
