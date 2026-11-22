import { and, eq, sql, type SQLWrapper } from 'drizzle-orm';
import { importBatches } from '../../schema/archive.js';
import { procurementImportFiles } from '../../schema/procurement.js';

export function isAppliedImportBatch() {
  return and(eq(importBatches.status, 'committed'), isOriginalImportBatch(importBatches));
}

export function isOriginalImportBatch({ id, fileId, template }: { readonly id: SQLWrapper; readonly fileId: SQLWrapper; readonly template: SQLWrapper }) {
  return sql`(${template} <> 'po-master-v1' or not exists (
    select 1 from ${procurementImportFiles}
    where ${procurementImportFiles.fileId} = ${fileId} and ${procurementImportFiles.importBatchId} <> ${id}
  ))`;
}
