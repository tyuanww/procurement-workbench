import type { Settings } from '@sw/domain';

export interface SettingsRepository {
  /** 单例。还没有行时返回领域默认值，不抛错。 */
  get(): Promise<Settings>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(settings: Settings): Promise<void>;
  /** 只有设置仍等于读取时的值才覆盖，返回是否写入。 */
  saveConditional?(settings: Settings, expected: Settings): Promise<boolean>;
}
