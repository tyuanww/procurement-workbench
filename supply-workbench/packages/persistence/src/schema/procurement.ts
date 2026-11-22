import { index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import type { ProcurementFact, ProcurementReviewReason } from '@sw/application';
import { importBatches } from './archive.js';
import { orderLines } from './orders.js';

export const procurementImportFiles = pgTable('procurement_import_files', {
  fileId: text('file_id').primaryKey(),
  importBatchId: text('import_batch_id').notNull().references(() => importBatches.id),
});

export const procurementObservations = pgTable('procurement_observations', {
  importBatchId: text('import_batch_id').notNull().references(() => importBatches.id),
  sheetName: text('sheet_name').notNull(),
  rowNo: integer('row_no').notNull(),
  identityKey: text('identity_key'),
  finishedLineIds: text('finished_line_ids').array().notNull(),
  materialLineId: text('material_line_id').references(() => orderLines.id),
  reasons: text('reasons').array().$type<ProcurementReviewReason[]>().notNull(),
  fact: jsonb('fact').$type<ProcurementFact>().notNull(),
}, (table) => [
  primaryKey({ columns: [table.importBatchId, table.sheetName, table.rowNo] }),
  index('procurement_observations_line_idx').on(table.materialLineId),
]);

export const procurementFinishedLines = pgTable('procurement_finished_lines', {
  materialLineId: text('material_line_id').notNull().references(() => orderLines.id),
  finishedLineId: text('finished_line_id').notNull().references(() => orderLines.id),
}, (table) => [
  primaryKey({ columns: [table.materialLineId, table.finishedLineId] }),
  index('procurement_finished_lines_finished_idx').on(table.finishedLineId),
]);
