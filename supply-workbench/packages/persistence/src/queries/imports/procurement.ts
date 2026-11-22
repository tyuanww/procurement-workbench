import { and, eq, isNotNull, ne, or, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../client.js';
import type { ProcurementSubmission } from '../../../../application/src/ports/procurement-preview.js';
import { importBatches, importRows } from '../../schema/archive.js';
import { procurementImportFiles, procurementObservations } from '../../schema/procurement.js';

export async function procurementSubmission(db: AppDatabase, id: string): Promise<ProcurementSubmission | undefined> {
  const matched = (await db.select({ id: procurementImportFiles.importBatchId })
    .from(importBatches)
    .innerJoin(procurementImportFiles, eq(procurementImportFiles.fileId, importBatches.fileId))
    .where(and(eq(importBatches.id, id), eq(importBatches.template, 'po-master-v1'), or(
      eq(importBatches.status, 'committed'),
      and(eq(importBatches.status, 'discarded'), sql`${importBatches.fileMeta}->>'procurementReplayOf' = ${procurementImportFiles.importBatchId}`),
    ))))[0];
  if (matched === undefined) return undefined;
  const [observations, finishedRows] = await Promise.all([
    db.select({
      sheetName: procurementObservations.sheetName, rowNo: procurementObservations.rowNo,
      materialLineId: procurementObservations.materialLineId, reasons: procurementObservations.reasons,
    }).from(procurementObservations).where(eq(procurementObservations.importBatchId, matched.id)),
    db.select({ sheetName: importRows.sheetName, rowNo: importRows.rowNo, orderLineId: importRows.targetId }).from(importRows)
      .where(and(eq(importRows.importBatchId, matched.id), isNotNull(importRows.targetId), ne(importRows.action, 'skip'))),
  ]);
  const finished = finishedRows.flatMap(({ orderLineId, ...source }) => orderLineId === null ? [] : [{ ...source, orderLineId }]);
  return { originalBatchId: matched.id, finished, observations };
}
