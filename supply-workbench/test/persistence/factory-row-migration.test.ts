import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDb, type AppHandle } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';

let handle: AppHandle;

beforeAll(async () => {
  handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
});

afterAll(async () => {
  await handle.close();
});

it('旧库重复工厂行先确定性归并，再成功应用唯一索引迁移', async () => {
  await handle.exec('drop index if exists factory_schedule_row_identity_uq');
  await handle.exec("delete from schema_migrations where id in ('0008_factory_row_identity', '0009_factory_snapshot_backfill')");
  await handle.exec("insert into factory_schedule_cells (id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint, link_status, created_at, updated_at) values ('legacy-schedule-unlinked', 'legacy-import', 'factory-1', '排产计划', 20, '{}'::jsonb, 'legacy-fingerprint', 'unlinked', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')");
  await handle.exec("insert into factory_schedule_cells (id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint, linked_order_line_id, link_status, created_at, updated_at) values ('legacy-schedule-linked', 'legacy-import', 'factory-1', '排产计划', 20, '{}'::jsonb, 'legacy-fingerprint', 'line-1', 'linked', '2026-10-12T00:00:00.000Z', '2026-10-13T00:00:00.000Z')");

  await migrate(handle.exec);

  const rows = rowsOf(await handle.exec("select id, linked_order_line_id from factory_schedule_cells where import_batch_id = 'legacy-import' and fingerprint = 'legacy-fingerprint' and sheet_name = '排产计划' and row_no = 20"));
  const indexes = rowsOf(await handle.exec("select indexname from pg_indexes where tablename = 'factory_schedule_cells' and indexname = 'factory_schedule_row_identity_uq'"));
  expect(rows).toEqual([{ id: 'legacy-schedule-linked', linked_order_line_id: 'line-1' }]);
  expect(indexes).toHaveLength(1);
});

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return rowsOf(result[0]);
  if (typeof result !== 'object' || result === null || !('rows' in result) || !Array.isArray(result.rows)) return [];
  return result.rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
