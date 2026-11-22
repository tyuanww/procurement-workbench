import type { LocalDate, WeeklyReport } from '@sw/domain';

export interface WeeklyReportRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<WeeklyReport>;
  /** 找不到返回 undefined。 */
  find(id: string): Promise<WeeklyReport | undefined>;
  /** 这一周尚未被替代的周报。没有就 undefined。 */
  findCurrent(weekStart: LocalDate): Promise<WeeklyReport | undefined>;
  /** 按生成时间倒序。page 从 1 开始。 */
  list(page: { readonly page: number; readonly pageSize: number }): Promise<{ readonly items: readonly WeeklyReport[]; readonly total: number }>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: WeeklyReport): Promise<void>;
}
