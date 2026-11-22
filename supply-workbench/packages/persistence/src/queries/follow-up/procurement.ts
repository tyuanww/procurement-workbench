import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { ProcurementLineDetail } from '@sw/application';
import type { AppDatabase } from '../../client.js';
import { instantOrNull } from '../../mappers/time.js';
import { importBatches } from '../../schema/archive.js';
import { orderLines, purchaseOrders } from '../../schema/orders.js';
import { storedFiles } from '../../schema/platform.js';
import { scopedEdgeExists, type ScopedStore } from '../store-progress/scope.js';
import { procurementFinishedLines, procurementObservations } from '../../schema/procurement.js';

export async function procurementDetail(db: AppDatabase, { line, store }: { readonly line: typeof orderLines.$inferSelect; readonly store: ScopedStore | undefined }): Promise<ProcurementLineDetail | undefined> {
  const isComponent = line.origin === 'import_procurement_component';
  if (!isComponent && line.lane !== 'finished') return undefined;
  const [related, ownSources] = await Promise.all([
    db.select({ id: orderLines.id, nameRaw: orderLines.nameRaw, itemCodeRaw: orderLines.itemCodeRaw, barcodeRaw: orderLines.barcodeRaw, poRaw: purchaseOrders.poRaw })
      .from(procurementFinishedLines)
      .innerJoin(orderLines, eq(orderLines.id, isComponent ? procurementFinishedLines.finishedLineId : procurementFinishedLines.materialLineId))
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId))
      .where(and(
        eq(isComponent ? procurementFinishedLines.materialLineId : procurementFinishedLines.finishedLineId, line.id),
        store === undefined ? undefined : scopedEdgeExists({ store, edgeCondition: sql`finished_id = ${procurementFinishedLines.finishedLineId} and material_line_id = ${procurementFinishedLines.materialLineId}` }),
      ))
      .orderBy(asc(purchaseOrders.poRaw), asc(orderLines.id)),
    isComponent ? sources(db, { id: line.id, store }) : [],
  ]);
  if (!isComponent && related.length === 0) return undefined;
  return {
    relatedLines: related.map(({ id, nameRaw, itemCodeRaw, barcodeRaw, poRaw }) => ({ id, nameRaw, codeRaw: itemCodeRaw ?? barcodeRaw, poRaw })),
    sources: ownSources,
  };
}

async function sources(db: AppDatabase, { id, store }: { readonly id: string; readonly store: ScopedStore | undefined }): Promise<ProcurementLineDetail['sources']> {
  const rows = await db.select({
    importBatchId: procurementObservations.importBatchId, fact: procurementObservations.fact,
    finishedLineIds: procurementObservations.finishedLineIds,
    fileName: storedFiles.originalName, committedAt: importBatches.committedAt,
  }).from(procurementObservations)
    .innerJoin(importBatches, eq(importBatches.id, procurementObservations.importBatchId))
    .leftJoin(storedFiles, eq(storedFiles.id, importBatches.fileId))
    .where(and(
      eq(procurementObservations.materialLineId, id),
      store === undefined ? undefined : scopedEdgeExists({ store, edgeCondition: sql`
        scoped_edges.import_batch_id = ${procurementObservations.importBatchId} and
        scoped_edges.sheet_name = ${procurementObservations.sheetName} and scoped_edges.row_no = ${procurementObservations.rowNo}
      ` }),
    ))
    .orderBy(desc(importBatches.committedAt), desc(importBatches.id), asc(procurementObservations.sheetName), asc(procurementObservations.rowNo));
  const visible = store === undefined ? null : await db.execute<{ id: string }>(sql`
    select ${procurementFinishedLines.finishedLineId} as id from ${procurementFinishedLines}
    where ${procurementFinishedLines.materialLineId} = ${id} and ${scopedEdgeExists({
      store, edgeCondition: sql`finished_id = ${procurementFinishedLines.finishedLineId} and material_line_id = ${procurementFinishedLines.materialLineId}`,
    })}
  `);
  const visibleIds = visible === null ? null : new Set(visible.rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    finishedLineIds: visibleIds === null ? row.finishedLineIds : row.finishedLineIds.filter((lineId) => visibleIds.has(lineId)),
    committedAt: instantOrNull(row.committedAt) }));
}
