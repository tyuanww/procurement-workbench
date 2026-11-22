import { NotFoundError } from '@sw/application/errors';
import type { ImportQueries } from '../../../../application/src/ports/import-queries.js';
import type { ProcurementPreview } from '../../../../application/src/ports/procurement-preview.js';
import type { AppDatabase } from '../../client.js';
import { importBatches, importRows } from '../../schema/archive.js';
import { itemCodes, parties, partyAliases, storedFiles, users } from '../../schema/platform.js';
import { and, count, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { procurementSubmission } from './procurement.js';
import { toSummary } from './summary.js';
import { pageOf, rowView, rowsMatching } from './rows.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const { fileMeta, ...batchFields } = getTableColumns(importBatches);
const batchColumns = {
  ...batchFields,
  fileMeta: sql`case when jsonb_typeof(${fileMeta}) = 'object' then ${fileMeta} - 'procurement' - 'procurementComparison' else ${fileMeta} end`,
};

export function importQueries(db: AppDatabase): ImportQueries {
  return {
    getBatch: async (input) => {
      const batch = await oneBatch(db, input.importBatchId);
      const rows = await db.select().from(importRows).where(eq(importRows.importBatchId, batch.id));
      return toSummary({ batch, rows, names: await lookup(db), hasProcurementPreview: batch.hasProcurementPreview });
    },
    async getProcurementPreview(importBatchId) {
      const row = (await db.select({ procurement: sql<ProcurementPreview | null>`case when ${importBatches.template} = 'po-master-v1' then ${fileMeta} -> 'procurement' end` })
        .from(importBatches).where(eq(importBatches.id, importBatchId)))[0];
      if (row === undefined) throw new NotFoundError('导入批次', importBatchId);
      return row.procurement;
    },
    getProcurementSubmission: (id) => procurementSubmission(db, id),
    async listBatches(query) {
      const page = query.page ?? DEFAULT_PAGE;
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const where = batchFilter(query);
      const rows = await db.select(batchColumns).from(importBatches).where(where).orderBy(desc(importBatches.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
      const names = await lookup(db);
      return { items: rows.map((row) => toSummary({ batch: row, rows: [], names })).map(listItem), page: { page, pageSize, total: await totalOf(db, where) } };
    },
    async listRows(query) {
      const page = query.page ?? DEFAULT_PAGE;
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const rows = rowsMatching(await db.select().from(importRows).where(eq(importRows.importBatchId, query.importBatchId)), query);
      return { items: pageOf({ rows, page, pageSize }).map(rowView), page: { page, pageSize, total: rows.length } };
    },
  };
}

async function oneBatch(db: AppDatabase, id: string) {
  const row = (await db.select({
    ...batchColumns,
    hasProcurementPreview: sql<boolean>`coalesce(${importBatches.template} = 'po-master-v1' and jsonb_typeof(${fileMeta} -> 'procurement') = 'object', false)`,
  }).from(importBatches).where(eq(importBatches.id, id)))[0];
  if (row === undefined) throw new NotFoundError('导入批次', id);
  return row;
}

async function lookup(db: AppDatabase) {
  const [userRows, partyRows, fileRows, aliasRows, codeRows] = await Promise.all([
    db.select().from(users),
    db.select().from(parties),
    db.select().from(storedFiles),
    db.select().from(partyAliases),
    db.select().from(itemCodes),
  ]);
  return { userRows, partyRows, fileRows, aliasRows, codeRows };
}

function batchFilter(query: { readonly template?: string; readonly status?: string; readonly factoryPartyId?: string }) {
  const parts = [
    query.template === undefined ? undefined : eq(importBatches.template, query.template),
    query.status === undefined ? undefined : eq(importBatches.status, query.status),
    query.factoryPartyId === undefined ? undefined : eq(importBatches.factoryPartyId, query.factoryPartyId),
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : and(...parts);
}

async function totalOf(db: AppDatabase, where: ReturnType<typeof batchFilter>): Promise<number> {
  const [row] = await db.select({ total: count() }).from(importBatches).where(where);
  if (row === undefined) throw new Error('导入批次计数没有结果');
  return row.total;
}

function listItem(summary: Awaited<ReturnType<typeof toSummary>>) {
  return {
    id: summary.id,
    template: summary.template,
    factoryParty: summary.factoryParty,
    status: summary.status,
    ...(summary.coverage === undefined ? {} : { coverage: summary.coverage }),
    originalName: summary.file.originalName,
    createdBy: summary.createdBy,
    createdAt: summary.createdAt,
    committedAt: summary.committedAt,
    ...(summary.source === undefined ? {} : { sourceKey: summary.source.key }),
  };
}
