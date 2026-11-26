import type { WorkbookSession } from '@sw/application';
import type { Product } from '@sw/domain';
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { at, day, id, qty, timestamps } from './columns.js';

function meta() {
  return { id: id(), ...timestamps };
}

export const importBatches = pgTable(
  'import_batches',
  {
    ...meta(),
    fileId: text('file_id').notNull(),
    template: text('template').notNull(),
    factoryPartyId: text('factory_party_id'),
    status: text('status').notNull(),
    coverage: text('coverage').notNull().default('full_snapshot'),
    sourceKey: text('source_key'),
    sourceFingerprint: text('source_fingerprint'),
    effectiveAt: at('effective_at'),
    supersededAt: at('superseded_at'),
    revision: integer('revision').notNull().default(0),
    fileMeta: jsonb('file_meta').notNull(),
    stats: jsonb('stats').notNull(),
    decisions: jsonb('decisions').notNull(),
    createdBy: text('created_by').notNull(),
    committedBy: text('committed_by'),
    committedAt: at('committed_at'),
    rolledBackBy: text('rolled_back_by'),
    rolledBackAt: at('rolled_back_at'),
    error: text('error'),
  },
  (table) => [
    check('import_batches_coverage_check', sql`${table.coverage} in ('full_snapshot', 'partial')`),
    index('import_batches_source_key').on(table.sourceKey),
  ],
);

export const importRows = pgTable(
  'import_rows',
  {
    id: text('id').primaryKey(),
    importBatchId: text('import_batch_id').notNull(),
    sheetName: text('sheet_name').notNull(),
    rowNo: integer('row_no').notNull(),
    raw: jsonb('raw').notNull(),
    parsed: jsonb('parsed').notNull(),
    issues: jsonb('issues').notNull(),
    action: text('action').notNull(),
    targetId: text('target_id'),
    skipReason: text('skip_reason'),
  },
  (table) => [index('import_rows_batch_action').on(table.importBatchId, table.action)],
);

export const products = pgTable(
  'products',
  {
    ...meta(),
    barcodeRaw: text('barcode_raw').notNull(),
    barcodeBase: text('barcode_base').notNull(),
    filingName: text('filing_name'),
    spuKey: text('spu_key'),
    filingNo: text('filing_no'),
    skuName: text('sku_name').notNull(),
    netContent: text('net_content'),
    casePack: text('case_pack'),
    outerSize: text('outer_size'),
    productLine: text('product_line'),
    fieldSources: jsonb('field_sources').notNull(),
    workbookFieldSources: jsonb('workbook_field_sources').$type<NonNullable<Product['workbookFieldSources']>>().notNull().default({}),
    importBatchId: text('import_batch_id'),
    rowNo: integer('row_no'),
    editedBy: text('edited_by'),
    editedAt: at('edited_at'),
  },
  (table) => [uniqueIndex('products_barcode_raw').on(table.barcodeRaw), index('products_barcode_base').on(table.barcodeBase)],
);

export const productArchiveOwners = pgTable(
  'product_archive_owners',
  {
    productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    partCodeRaw: text('part_code_raw').notNull(),
    ownerName: text('owner_name').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.partCodeRaw] }),
    check('product_archive_owners_name_check', sql`char_length(trim(${table.ownerName})) between 1 and 100`),
  ],
);

export const productWorkbookImports = pgTable(
  'product_workbook_imports',
  {
    id: id(),
    anchorId: text('anchor_id').references(() => products.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    fileHash: text('file_hash').notNull(),
    createdAt: at('created_at').notNull().defaultNow(),
    session: jsonb('session').$type<WorkbookSession>().notNull(),
  },
  (table) => [index('product_workbook_imports_upload').on(table.anchorId, table.createdBy, table.fileHash, table.createdAt.desc())],
);

export const productImages = pgTable('product_images', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  slot: text('slot').notNull(),
  fileId: text('file_id').notNull(),
  order: integer('order').notNull(),
  source: text('source').notNull(),
  importBatchId: text('import_batch_id'),
  uploadedBy: text('uploaded_by'),
  hiddenAt: at('hidden_at'),
  hiddenBy: text('hidden_by'),
  hiddenReason: text('hidden_reason'),
}, (table) => [index('product_images_visible_file').on(table.fileId).where(sql`${table.hiddenAt} IS NULL`)]);

export const productContacts = pgTable(
  'product_contacts',
  {
    productId: text('product_id').notNull(),
    role: text('role').notNull(),
    userId: text('user_id'),
    nameRaw: text('name_raw'),
    note: text('note'),
    source: text('source').notNull(),
    updatedBy: text('updated_by').notNull(),
    updatedAt: at('updated_at').notNull(),
  },
  (table) => [index('product_contacts_product_role').on(table.productId, table.role)],
);

export const bomLines = pgTable(
  'bom_lines',
  {
    productBarcodeRaw: text('product_barcode_raw').notNull(),
    productName: text('product_name').notNull(),
    reorderCount: integer('reorder_count'),
    cumulativeQty: qty('cumulative_qty'),
    partCodeRaw: text('part_code_raw').notNull(),
    partName: text('part_name').notNull(),
    importBatchId: text('import_batch_id').notNull(),
    rowNo: integer('row_no').notNull(),
    mergedFill: boolean('merged_fill').notNull(),
  },
  (table) => [index('bom_lines_product_barcode').on(table.productBarcodeRaw), index('bom_lines_part_code').on(table.partCodeRaw)],
);

export const weeklyReports = pgTable('weekly_reports', {
  ...meta(),
  weekStart: day('week_start').notNull(),
  generatedAt: at('generated_at').notNull(),
  generatedBy: text('generated_by').notNull(),
  data: jsonb('data').notNull(),
  dataWatermark: jsonb('data_watermark').notNull(),
  exports: jsonb('exports').notNull(),
  supersededBy: text('superseded_by'),
});
