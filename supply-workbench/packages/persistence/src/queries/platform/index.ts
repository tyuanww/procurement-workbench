import { TEMPLATE_IDS, TEMPLATE_ID_LABELS, type TemplateId } from '@sw/domain';
import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { AuditQueries } from '../../../../application/src/ports/audit-queries.js';
import type { FreshnessQueries } from '../../../../application/src/ports/freshness-queries.js';
import type { AuditEntryView, FreshnessResponse, FreshnessSource } from '../../../../application/src/platform/views.js';
import type { AppDatabase } from '../../client.js';
import { instant, instantOrNull } from '../../mappers/time.js';
import { importBatches } from '../../schema/archive.js';
import { isAppliedImportBatch } from '../imports/applied-source.js';
import { auditLog, storedFiles } from '../../schema/platform.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;

export function auditQueries(db: AppDatabase): AuditQueries {
  return {
    async list(query) {
      const page = query.page ?? DEFAULT_PAGE;
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const where = filters(query);
      const rows = await db.select().from(auditLog).where(where).orderBy(desc(auditLog.at)).limit(pageSize).offset((page - 1) * pageSize);
      const totalRow = (await db.select({ total: count() }).from(auditLog).where(where))[0];
      return { items: rows.map(toEntry), page: { page, pageSize, total: totalRow === undefined ? 0 : totalRow.total } };
    },
  };
}

export function freshnessQueries(db: AppDatabase): FreshnessQueries {
  return {
    async load() {
      const rows = await db.select({ batch: importBatches, uploadedAt: storedFiles.createdAt }).from(importBatches)
        .leftJoin(storedFiles, eq(storedFiles.id, importBatches.fileId)).where(isAppliedImportBatch());
      return latest(rows);
    },
  };
}

function filters(query: { readonly entity?: string; readonly entityId?: string; readonly actorUserId?: string; readonly from?: string; readonly to?: string }) {
  const parts = [
    query.entity === undefined ? undefined : eq(auditLog.entity, query.entity),
    query.entityId === undefined ? undefined : eq(auditLog.entityId, query.entityId),
    query.actorUserId === undefined ? undefined : eq(auditLog.actorUserId, query.actorUserId),
    query.from === undefined ? undefined : gte(sql`(${auditLog.at})::date`, query.from),
    query.to === undefined ? undefined : lte(sql`(${auditLog.at})::date`, query.to),
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : and(...parts);
}

function toEntry(row: typeof auditLog.$inferSelect): AuditEntryView {
  return { ...row, at: instant(row.at) };
}

type AppliedSource = { readonly batch: typeof importBatches.$inferSelect; readonly uploadedAt: string | null };

function latest(rows: readonly AppliedSource[]): FreshnessResponse {
  const grouped = new Map<string, { source: FreshnessSource; uploadedAt: string | null }>();
  for (const { batch, uploadedAt } of rows) {
    const key = `${batch.template}:${batch.factoryPartyId ?? ''}`;
    const current = grouped.get(key);
    const at = instantOrNull(batch.committedAt);
    if (current !== undefined && !isLaterCommit(at, current.source.lastCommittedAt)) continue;
    const template = templateOf(batch.template);
    const source = { template, factoryPartyId: batch.factoryPartyId, label: TEMPLATE_ID_LABELS[template], lastCommittedAt: at, fileModifiedAt: modifiedAt(batch.fileMeta) };
    grouped.set(key, { source, uploadedAt });
  }
  const uploaded = grouped.get('po-master-v1:')?.uploadedAt;
  return { sources: [...grouped.values()].map(({ source }) => source), ...(uploaded ? { procurementUploadedAt: instant(uploaded) } : {}) };
}

function isLaterCommit(at: string | null, previous: string | null): boolean {
  return at !== null && (previous === null || at > previous);
}

function templateOf(value: string): TemplateId {
  for (const id of TEMPLATE_IDS) {
    if (id === value) return id;
  }
  throw new Error(`未知导入模板 ${value}`);
}

export function modifiedAt(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('coreXmlModifiedAt' in value)) return null;
  return typeof value.coreXmlModifiedAt === 'string' ? value.coreXmlModifiedAt : null;
}
