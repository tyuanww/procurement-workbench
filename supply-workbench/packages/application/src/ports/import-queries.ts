import type { ListResult } from '../shared/page.js';
import type { ProcurementSubmission } from './procurement-preview.js';
import type { ProcurementPreview } from './procurement-preview.js';
import type {
  ImportBatchIdInput,
  ImportBatchListItem,
  ImportBatchSummary,
  ImportListQuery,
  ImportRowView,
  ImportRowsQuery,
} from '../imports/views.js';

export interface ImportQueries {
  /** 找不到就抛 NotFoundError。 */
  getBatch(input: ImportBatchIdInput): Promise<ImportBatchSummary>;
  getProcurementPreview(importBatchId: string): Promise<ProcurementPreview | null>;
  getProcurementSubmission?(importBatchId: string): Promise<ProcurementSubmission | undefined>;
  listBatches(query: ImportListQuery): Promise<ListResult<ImportBatchListItem>>;
  listRows(query: ImportRowsQuery): Promise<ListResult<ImportRowView>>;
}
