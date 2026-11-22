import { writeFileSync } from 'node:fs';
import { entityId, type ImportBatch, type ImportRow } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { makeCommitImport } from '../../packages/application/src/imports/index.js';
import './load-import-registry.js';
import { aUser, FixedClock } from '../../packages/testkit/src/index.js';
import { createDb } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { auditRepository } from '../../packages/persistence/src/repositories/audit-log.js';
import { factoryReportRepository } from '../../packages/persistence/src/repositories/factory-reports.js';
import { importBatchRepository } from '../../packages/persistence/src/repositories/import-batches.js';
import { placeholderStores } from '../../packages/persistence/src/repositories/index.js';
import { requireDatabase } from '../../packages/persistence/src/require-database.js';
import { createUnitOfWork } from '../../packages/persistence/src/unit-of-work.js';
import { createPgFixture, type PgFixture } from './pg-fixtures.js';

const AT = '2026-10-12T00:00:00.000Z';
const EVIDENCE = new URL('./fingerprint-order.json', import.meta.url);
const serverUrl = process.env.SW_PG_URL;

it('真实 PG 反序读取时，日期格仍按自己的指纹继承 linked 和 manual', async () => {
  const fixture = await createPgFixture();
  try {
    await prove(fixture, false);
  } finally {
    await fixture.handle.close();
  }
});

it.skipIf(serverUrl === undefined)('PostgreSQL 16 反序读取时，日期格仍按自己的指纹继承 linked 和 manual', async () => {
  if (serverUrl === undefined) return;
  const handle = await createDb({ driver: 'pg', url: serverUrl });
  await migrate(handle.exec);
  const fixture: PgFixture = {
    handle,
    uow: createUnitOfWork(handle.db, (tx) => {
      const db = requireDatabase(tx);
      return { ...placeholderStores(), imports: importBatchRepository(db), factoryReports: factoryReportRepository(db), audit: auditRepository(db) };
    }),
  };
  try {
    await prove(fixture, true);
  } finally {
    await handle.close();
  }
});

async function prove(fixture: PgFixture, writeEvidence: boolean): Promise<void> {
    const version = textOf(await fixture.handle.exec('select version() as version'), 'version');
    const commit = makeCommitImport({ uow: fixture.uow, clock: new FixedClock(AT) });
    const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
    await saveBatch(fixture, { id: 'batch-a1', file: 'sha-a1', party: 'factory-a', fingerprints: ['fp-1001', 'fp-1002'] });
    await saveCell(fixture, { id: 'row-b', batchId: 'batch-a1', day: '2026-10-02', qty: 2, fingerprint: 'fp-1002' });
    await saveCell(fixture, { id: 'row-a', batchId: 'batch-a1', day: '2026-10-01', qty: 1, fingerprint: 'fp-1001' });
    const readOrder = (await fixture.uow.run((tx) => tx.imports.listRows(entityId('batch-a1')))).map((row) => dayOf(row.parsed));
    expect(readOrder).toEqual(['2026-10-02', '2026-10-01']);
    await commit({ importBatchId: 'batch-a1' }, actor);
    await fixture.handle.exec(`update factory_schedule_cells set linked_order_line_id = 'line-1', link_status = 'linked', link_reason = null where fingerprint = 'fp-1001'`);
    await fixture.handle.exec(`update factory_schedule_cells set linked_order_line_id = 'line-2', link_status = 'manual', link_reason = null where fingerprint = 'fp-1002'`);

    await saveBatch(fixture, { id: 'batch-a2', file: 'sha-a2', party: 'factory-a', fingerprints: ['fp-1001', 'fp-1002'] });
    await saveCell(fixture, { id: 'row-d', batchId: 'batch-a2', day: '2026-10-02', qty: 2, fingerprint: 'fp-1002', action: 'unchanged' });
    await saveCell(fixture, { id: 'row-c', batchId: 'batch-a2', day: '2026-10-01', qty: 1, fingerprint: 'fp-1001', action: 'unchanged' });
    const secondRead = (await fixture.uow.run((tx) => tx.imports.listRows(entityId('batch-a2')))).map((row) => dayOf(row.parsed));
    expect(secondRead).toEqual(['2026-10-02', '2026-10-01']);
    await commit({ importBatchId: 'batch-a2' }, actor);

    await saveBatch(fixture, { id: 'batch-b', file: 'sha-b', party: 'factory-b', fingerprints: ['fp-1001'] });
    await saveCell(fixture, { id: 'row-other', batchId: 'batch-b', day: '2026-10-01', qty: 1, fingerprint: 'fp-1001', action: 'unchanged' });
    await commit({ importBatchId: 'batch-b' }, actor);

    await saveBatch(fixture, { id: 'batch-qty', file: 'sha-qty', party: 'factory-a', fingerprints: ['fp-1001-qty-9'] });
    await saveCell(fixture, { id: 'row-qty', batchId: 'batch-qty', day: '2026-10-01', qty: 9, fingerprint: 'fp-1001-qty-9', action: 'create' });
    await commit({ importBatchId: 'batch-qty' }, actor);

    await saveBatch(fixture, { id: 'batch-dup-old', file: 'sha-dup-old', party: 'factory-a', fingerprints: ['fp-dup', 'fp-dup'] });
    await saveCell(fixture, { id: 'dup-old-1', batchId: 'batch-dup-old', rowNo: 8, day: '2026-10-03', qty: 1, fingerprint: 'fp-dup' });
    await saveCell(fixture, { id: 'dup-old-2', batchId: 'batch-dup-old', rowNo: 9, day: '2026-10-03', qty: 1, fingerprint: 'fp-dup' });
    await commit({ importBatchId: 'batch-dup-old' }, actor);
    await fixture.handle.exec(`update factory_schedule_cells set linked_order_line_id = 'line-1', link_status = 'linked' where id = 'dup-old-1:report'`);
    await fixture.handle.exec(`update factory_schedule_cells set linked_order_line_id = 'line-2', link_status = 'manual' where id = 'dup-old-2:report'`);
    await saveBatch(fixture, { id: 'batch-dup', file: 'sha-dup', party: 'factory-a', fingerprints: ['fp-dup', 'fp-dup'] });
    await saveCell(fixture, { id: 'dup-2', batchId: 'batch-dup', rowNo: 9, day: '2026-10-03', qty: 1, fingerprint: 'fp-dup', action: 'unchanged' });
    await saveCell(fixture, { id: 'dup-1', batchId: 'batch-dup', rowNo: 8, day: '2026-10-03', qty: 1, fingerprint: 'fp-dup', action: 'unchanged' });
    await commit({ importBatchId: 'batch-dup' }, actor);

    const cells = rowsOf(await fixture.handle.exec(`select import_batch_id, fingerprint, day::text as day, qty::text as qty, link_status, linked_order_line_id from factory_schedule_cells order by import_batch_id, fingerprint, id`));
    const carried = cells.filter((row) => row.import_batch_id === 'batch-a2');
    expect(carried).toEqual([
      expect.objectContaining({ fingerprint: 'fp-1001', day: '2026-10-01', link_status: 'linked', linked_order_line_id: 'line-1' }),
      expect.objectContaining({ fingerprint: 'fp-1002', day: '2026-10-02', link_status: 'manual', linked_order_line_id: 'line-2' }),
    ]);
    expect(cells.find((row) => row.import_batch_id === 'batch-a1' && row.fingerprint === 'fp-1001')).toMatchObject({ day: '2026-10-01', link_status: 'linked', linked_order_line_id: 'line-1' });
    expect(cells.find((row) => row.import_batch_id === 'batch-b')).toMatchObject({ fingerprint: 'fp-1001', link_status: 'unlinked', linked_order_line_id: null });
    expect(cells.find((row) => row.import_batch_id === 'batch-qty')).toMatchObject({ fingerprint: 'fp-1001-qty-9', link_status: 'unlinked' });
    const duplicates = cells.filter((row) => row.import_batch_id === 'batch-dup');
    expect(duplicates.every((row) => row.link_status === 'unlinked' && row.linked_order_line_id === null)).toBe(true);
    const evidence = {
      engine: version,
      fileFingerprintOrder: ['fp-1001', 'fp-1002'],
      firstReadOrder: readOrder,
      secondReadOrder: secondRead,
      cells,
    };
    if (writeEvidence) writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
}

async function saveBatch(fixture: Awaited<ReturnType<typeof createPgFixture>>, input: { readonly id: string; readonly file: string; readonly party: string; readonly fingerprints: readonly string[] }): Promise<void> {
  await fixture.uow.run(async (tx) => {
    await tx.imports.save(batch(input));
  });
}

async function saveCell(fixture: Awaited<ReturnType<typeof createPgFixture>>, input: { readonly id: string; readonly batchId: string; readonly rowNo?: number; readonly day: string; readonly qty: number; readonly fingerprint: string; readonly action?: ImportRow['action'] }): Promise<void> {
  await fixture.uow.run(async (tx) => {
    await tx.imports.saveRow(cell(input));
  });
}

function batch(input: { readonly id: string; readonly file: string; readonly party: string; readonly fingerprints: readonly string[] }): ImportBatch {
  return {
    id: entityId(input.id), createdAt: AT, updatedAt: AT, fileId: entityId(input.file), template: 'factory-progress-v1', factoryPartyId: entityId(input.party),
    sourceKey: `factory-progress-v1:${input.party}`, sourceFingerprint: input.file, effectiveAt: AT, supersededAt: null,
    status: 'parsed', coverage: 'full_snapshot', revision: 0,
    fileMeta: { fingerprints: input.fingerprints.map((fingerprint) => ({ sheet: '排产计划', rowNo: 8, fingerprint })) },
    stats: {}, decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] },
    createdBy: entityId('buyer-1'), committedBy: null, committedAt: null, rolledBackBy: null, rolledBackAt: null, error: null,
  };
}

function cell(input: { readonly id: string; readonly batchId: string; readonly rowNo?: number; readonly day: string; readonly qty: number; readonly fingerprint: string; readonly action?: ImportRow['action'] }): ImportRow {
  const action = input.action ?? 'create';
  const payload = { day: input.day, qty: input.qty, fingerprint: input.fingerprint };
  return {
    id: entityId(input.id), importBatchId: entityId(input.batchId), sheetName: '排产计划', rowNo: input.rowNo ?? 8,
    raw: { day: input.day, qty: input.qty }, parsed: payload, issues: [], action, targetId: null, skipReason: null,
  };
}

function dayOf(parsed: unknown): string {
  if (typeof parsed !== 'object' || parsed === null || !('day' in parsed) || typeof parsed.day !== 'string') return '';
  return parsed.day;
}

function textOf(result: unknown, key: string): string {
  const row = rowsOf(result)[0];
  const value = row?.[key];
  return typeof value === 'string' ? value : '';
}

function rowsOf(result: unknown): readonly Record<string, unknown>[] {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter((row: unknown): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
