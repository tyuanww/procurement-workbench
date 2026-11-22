import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ProcurementRepository } from '../../../application/src/ports/procurement-repository.js';
import type { ProcurementPreview } from '../../../application/src/ports/procurement-preview.js';
import { orderLines, purchaseOrders } from '../schema/orders.js';
import { orderLineOfRow } from './order-lines.js';
import { purchaseOrderOfRow } from './purchase-orders.js';
import { importBatches } from '../schema/archive.js';
import type { AppDatabase } from '../client.js';
import { procurementFinishedLines, procurementImportFiles, procurementObservations } from '../schema/procurement.js';

export function procurementRepository(db: AppDatabase): ProcurementRepository {
  return {
    async preview(importBatchId) {
      const result = (await db.select({ preview: sql<ProcurementPreview | null>`case when ${importBatches.template} = 'po-master-v1' then ${importBatches.fileMeta} -> 'procurement' end` })
        .from(importBatches).where(eq(importBatches.id, importBatchId)))[0];
      return result?.preview ?? null;
    },
    async lockCommit() {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext('supply'), hashtext('po-master-commit'))`);
    },
    async originalBatchId(fileId) {
      const row = (await db.select().from(procurementImportFiles).where(eq(procurementImportFiles.fileId, fileId)))[0];
      return row?.importBatchId ?? null;
    },
    async recordFile(input) {
      await db.insert(procurementImportFiles).values(input);
    },
    materialsByPoNumbers: (poNumbers) => materialsByPoNumbers(db, poNumbers),
    async blockedIdentities() {
      const rows = await db.selectDistinct({ key: procurementObservations.identityKey }).from(procurementObservations)
        .where(sql`${procurementObservations.reasons} && array['duplicate_identity', 'supplier_conflict', 'unresolved_history']::text[]`);
      return new Set(rows.flatMap(({ key }) => key === null ? [] : [key]));
    },
    recordObservations: (rows) => recordObservations(db, rows),
    async linkFinishedLines({ materialLineId, finishedLineIds }) {
      if (finishedLineIds.length === 0) return;
      await db.insert(procurementFinishedLines).values(finishedLineIds.map((finishedLineId) => ({ materialLineId, finishedLineId }))).onConflictDoNothing();
    },
  };
}

async function materialsByPoNumbers(db: AppDatabase, poNumbers: readonly string[]) {
  const orders = new Map<string, typeof purchaseOrders.$inferSelect>();
  const lines = [];
  for (let index = 0; index < poNumbers.length; index += 2000) {
    const rows = await db.select({ line: orderLines, po: purchaseOrders }).from(purchaseOrders)
      .leftJoin(orderLines, and(eq(orderLines.purchaseOrderId, purchaseOrders.id), eq(orderLines.lane, 'material')))
      .where(and(eq(purchaseOrders.lane, 'material'), inArray(purchaseOrders.poNorm, poNumbers.slice(index, index + 2000))));
    for (const { line, po } of rows) {
      orders.set(po.id, po);
      if (line !== null) lines.push(orderLineOfRow(line));
    }
  }
  return { orders: [...orders.values()].map(purchaseOrderOfRow), lines };
}

async function recordObservations(db: AppDatabase, rows: Parameters<ProcurementRepository['recordObservations']>[0]) {
  for (let index = 0; index < rows.length; index += 500) {
    await db.insert(procurementObservations).values(rows.slice(index, index + 500).map((row) => ({
      ...row.fact.source,
      importBatchId: row.importBatchId,
      materialLineId: row.materialLineId,
      identityKey: row.identityKey,
      finishedLineIds: [...row.finishedLineIds],
      reasons: [...row.reasons],
      fact: row.fact,
    })));
  }
}
