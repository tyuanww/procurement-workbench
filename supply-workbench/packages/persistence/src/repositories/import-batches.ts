import { and, eq, isNotNull, notInArray } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import type { ImportBatch, ImportRow } from '@sw/domain';
import { IMPORT_ACTIONS, IMPORT_STATUSES, TEMPLATE_IDS, importCoverageOf } from '@sw/domain';
import type { ImportBatchRepository } from '../../../application/src/ports/import-batch-repository.js';
import type { AppDatabase } from '../client.js';
import { importBatches, importRows } from '../schema/archive.js';
import { orderLines, orderLineSnapshots } from '../schema/orders.js';
import { entityId, entityIdOrNull } from '../mappers/id.js';
import { importIssueFrom } from '../mappers/issues.js';
import { instant, instantOrNull } from '../mappers/time.js';
import { isAppliedImportBatch } from '../queries/imports/applied-source.js';

export function importBatchRepository(db: AppDatabase): ImportBatchRepository {
  return {
    async get(id) {
      const found = await findBatch(db, id);
      if (found === undefined) throw new NotFoundError('导入批次', id);
      return found;
    },
    find: (id) => findBatch(db, id),
    async save(entity) {
      const revision = entity.revision === undefined ? 0 : entity.revision;
      await db.insert(importBatches).values({ ...entity, coverage: entity.coverage ?? 'full_snapshot', revision }).onConflictDoUpdate({ target: importBatches.id, set: { ...entity, coverage: entity.coverage ?? 'full_snapshot', revision } });
    },
    async saveConditional(entity, expectedRevision) {
      const result = await db.update(importBatches).set({ ...entity, coverage: entity.coverage ?? 'full_snapshot', revision: expectedRevision + 1 }).where(and(eq(importBatches.id, entity.id), eq(importBatches.revision, expectedRevision)));
      return (result.rowCount === undefined || result.rowCount === null ? 0 : result.rowCount) > 0;
    },
    async list() {
      return (await db.select().from(importBatches)).map(toBatch);
    },
    listCurrentPoMasterRows: () => currentPoMasterRows(db),
    async listAppliedPoMasterBatches() {
      return (await db.select().from(importBatches).where(and(eq(importBatches.template, 'po-master-v1'), isAppliedImportBatch()))).map(toBatch);
    },
    async listRows(batchId) {
      return (await db.select().from(importRows).where(eq(importRows.importBatchId, batchId))).map(toRow);
    },
    async saveRow(row) {
      await db.insert(importRows).values(row).onConflictDoUpdate({ target: importRows.id, set: row });
    },
  };
}

async function currentPoMasterRows(db: AppDatabase) {
  const rows = await db.select({ candidateKey: orderLines.candidateKey, parsed: importRows.parsed }).from(orderLines)
    .innerJoin(orderLineSnapshots, eq(orderLineSnapshots.id, orderLines.currentSnapshotId))
    .innerJoin(importRows, and(eq(importRows.id, orderLineSnapshots.importRowId), eq(importRows.targetId, orderLines.id)))
    .innerJoin(importBatches, eq(importBatches.id, importRows.importBatchId))
    .where(and(eq(orderLines.lane, 'finished'), isNotNull(orderLines.candidateKey), notInArray(importRows.action, ['skip', 'conflict']),
      eq(importBatches.template, 'po-master-v1'), isAppliedImportBatch()));
  return rows.flatMap(({ candidateKey, parsed }) => candidateKey === null ? [] : [{ candidateKey, parsed }]);
}

async function findBatch(db: AppDatabase, id: string): Promise<ImportBatch | undefined> {
  const row = (await db.select().from(importBatches).where(eq(importBatches.id, id)))[0];
  return row === undefined ? undefined : toBatch(row);
}

function toBatch(row: typeof importBatches.$inferSelect): ImportBatch {
  const { revision, sourceKey, sourceFingerprint, effectiveAt, supersededAt, ...rest } = row;
  return {
    ...rest,
    coverage: importCoverageOf(row.coverage),
    ...(sourceKey === null ? {} : { sourceKey, sourceFingerprint, effectiveAt: instantOrNull(effectiveAt), supersededAt: instantOrNull(supersededAt) }),
    ...(revision === undefined || revision === 0 ? {} : { revision }),
    id: entityId(row.id),
    fileId: entityId(row.fileId),
    factoryPartyId: entityIdOrNull(row.factoryPartyId),
    createdBy: entityId(row.createdBy),
    committedBy: entityIdOrNull(row.committedBy),
    rolledBackBy: entityIdOrNull(row.rolledBackBy),
    template: oneOf({ values: TEMPLATE_IDS, value: row.template, label: '模板' }),
    status: oneOf({ values: IMPORT_STATUSES, value: row.status, label: '导入状态' }),
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    committedAt: instantOrNull(row.committedAt),
    rolledBackAt: instantOrNull(row.rolledBackAt),
  };
}

function toRow(row: typeof importRows.$inferSelect): ImportRow {
  return { ...row, id: entityId(row.id), importBatchId: entityId(row.importBatchId), targetId: entityIdOrNull(row.targetId), action: oneOf({ values: IMPORT_ACTIONS, value: row.action, label: '导入动作' }), issues: arrayOf(row.issues) };
}

function arrayOf(value: unknown): ImportRow['issues'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(issueOrEmpty);
}

function issueOrEmpty(value: unknown): ImportRow['issues'] {
  const issue = importIssueFrom(value);
  return issue === null ? [] : [issue];
}

function oneOf<T extends string>({ values, value, label }: { readonly values: readonly T[]; readonly value: string; readonly label: string }): T {
  for (const item of values) if (item === value) return item;
  throw new Error(`认不出的${label}: ${value}`);
}
