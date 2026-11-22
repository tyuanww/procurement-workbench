import type { LocalDate } from '@sw/domain';
import type { PendingBatchSource, TodayCatalog, TodoExceptionSource } from '../today/views.js';

export interface UncommittedImport {
  readonly id: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ReviewQueueCounts {
  readonly aliases: number;
  readonly codes: number;
  readonly links: number;
  readonly multiName: number;
}

export interface TodayReadModel {
  loadCatalog(asOf: LocalDate): Promise<TodayCatalog>;
  loadPendingBatch(buyerId: string | null): Promise<readonly PendingBatchSource[]>;
  loadOpenExceptions(): Promise<readonly TodoExceptionSource[]>;
  loadReviewCounts(): Promise<ReviewQueueCounts>;
  /** 这个用户上传、状态仍是 parsed 的导入。 */
  loadUncommittedImports(actorId: string): Promise<readonly UncommittedImport[]>;
}
