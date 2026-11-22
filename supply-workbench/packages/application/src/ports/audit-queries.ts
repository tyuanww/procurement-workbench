import type { ListResult } from '../shared/page.js';
import type { AuditEntryView, AuditQuery } from '../platform/views.js';

export interface AuditQueries {
  list(query: AuditQuery): Promise<ListResult<AuditEntryView>>;
}
