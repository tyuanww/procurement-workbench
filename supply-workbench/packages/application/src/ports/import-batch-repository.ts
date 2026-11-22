import type { ImportBatch, ImportRow } from '@sw/domain';

export interface ImportBatchRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<ImportBatch>;
  /** 找不到返回 undefined。 */
  find(id: string): Promise<ImportBatch | undefined>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: ImportBatch): Promise<void>;
  /** 按 revision 条件更新。返回 false 表示版本已被其他请求推进。旧内存适配器可省略。 */
  saveConditional?(entity: ImportBatch, expectedRevision: number): Promise<boolean>;
  /** 全部批次。没有就返回空数组。 */
  list(): Promise<readonly ImportBatch[]>;
  /** 当前成品快照指向的已应用总表行。旧适配器可省略。 */
  listCurrentPoMasterRows?(): Promise<readonly { readonly candidateKey: string; readonly parsed: unknown }[]>;
  /** 已实际应用的总表批次。旧适配器可省略。 */
  listAppliedPoMasterBatches?(): Promise<readonly ImportBatch[]>;
  /** 这一批的行。没有就返回空数组。 */
  listRows(batchId: string): Promise<readonly ImportRow[]>;
  /** 插入或按 id 覆盖一行。 */
  saveRow(row: ImportRow): Promise<void>;
}
