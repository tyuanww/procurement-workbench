import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createDb, type AppHandle } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';

const at = '2026-11-09T00:00:00.000Z';

it('0013/0014 迁移只建表，不给现有行回填假负责人', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    await migrate(handle.exec);
    expect(await count(handle, 'owner_assignments')).toBe(0);
    expect(await count(handle, 'line_factory_links')).toBe(0);
    expect(await columnNames(handle, 'owner_assignments')).toEqual(expect.arrayContaining(['subject_type', 'subject_id', 'owner_user_id', 'status', 'source', 'effective_at', 'superseded_at']));
    expect(await columnNames(handle, 'line_factory_links')).toEqual(expect.arrayContaining(['order_line_id', 'factory_party_id', 'status', 'source', 'confidence', 'linked_at']));
    await handle.exec(`insert into users (id, created_at, updated_at, name, roles, active) values ('admin-1', '${at}', '${at}', '管理员', '{admin}', true)`);
    await handle.exec(`insert into order_lines (id, created_at, updated_at, purchase_order_id, lane, origin, missing_in_latest_import, stage, stage_changed_at) select 'line-' || g, '${at}', '${at}', 'po-' || g, 'finished', 'import_po_master', false, 'no_batch', '${at}' from generate_series(1, 606) g`);
    await applySqlFile(handle, '0013_owner_assignments.sql');
    expect(await count(handle, 'owner_assignments')).toBe(0);
    const unowned = rowsOf(await handle.exec(`select count(*)::int as n from order_lines where buyer_user_id is null`));
    expect(Number(unowned[0]?.n)).toBe(606);
  } finally {
    await handle.close();
  }
});

it('0014 用已审批别名回填采购单供应商，并回填已有手工工厂关联', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    await handle.exec(`insert into parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse, note) values ('supplier-1', '${at}', '${at}', '宜侬', true, false, false, null)`);
    await handle.exec(`insert into party_aliases (id, created_at, updated_at, raw_name, norm_name, party_id, status, first_seen_import_batch_id, seen_count, seen_batch_count, reviewed_by, reviewed_at) values ('alias-1', '${at}', '${at}', '宜侬', '宜侬', 'supplier-1', 'approved', null, 1, 1, 'admin-1', '${at}')`);
    await handle.exec(`insert into purchase_orders (id, created_at, updated_at, po_raw, po_norm, po_format, related_po_raws, supplier_party_id, supplier_raw, lane, oa_demand_ref) values ('po-1', '${at}', '${at}', 'PO1', 'PO1', 'OTHER', '{}', null, '  宜侬 ', 'finished', null)`);
    await handle.exec(`insert into purchase_orders (id, created_at, updated_at, po_raw, po_norm, po_format, related_po_raws, supplier_party_id, supplier_raw, lane, oa_demand_ref) values ('po-2', '${at}', '${at}', 'PO2', 'PO2', 'OTHER', '{}', null, '别的供应商', 'finished', null)`);
    await handle.exec(`insert into factory_shipment_rows (id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint, linked_order_line_id, link_status, link_reason, created_at, updated_at, po_raw, po_norm, item_code_raw, name_raw) values ('row-1', 'batch-1', 'factory-1', '出货明细', 2, '{}', 'fp-1', 'line-1', 'manual', null, '${at}', '${at}', 'PO1', 'PO1', 'ITEM1', '海葡萄')`);

    await applySqlFile(handle, '0014_supplier_factory_links.sql');
    await applySqlFile(handle, '0014_supplier_factory_links.sql');

    const orders = rowsOf(await handle.exec(`select id, supplier_party_id from purchase_orders order by id`));
    expect(orders[0]).toMatchObject({ id: 'po-1', supplier_party_id: 'supplier-1' });
    expect(orders[1]).toMatchObject({ id: 'po-2', supplier_party_id: null });
    const links = rowsOf(await handle.exec(`select order_line_id, factory_party_id, status, source, confidence from line_factory_links`));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ order_line_id: 'line-1', factory_party_id: 'factory-1', status: 'manual', source: 'factory_progress', confidence: 'manual' });
  } finally {
    await handle.close();
  }
});

it('新表约束不接受无负责人的 assigned 和带工厂的 unlinked', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    await expect(handle.exec(`insert into owner_assignments (id, created_at, updated_at, subject_type, subject_id, owner_user_id, owner_name_raw, status, source, effective_at) values ('a1', '${at}', '${at}', 'order_line', 'line-1', null, '采购甲', 'assigned', 'manual', '${at}')`)).rejects.toThrow();
    await expect(handle.exec(`insert into owner_assignments (id, created_at, updated_at, subject_type, subject_id, owner_user_id, owner_name_raw, status, source, effective_at) values ('a2', '${at}', '${at}', 'order_line', 'line-1', 'user-1', '采购甲', 'pending', 'manual', '${at}')`)).rejects.toThrow();
    await expect(handle.exec(`insert into line_factory_links (id, created_at, updated_at, order_line_id, factory_party_id, status, source, confidence, linked_at) values ('l1', '${at}', '${at}', 'line-1', 'factory-1', 'unlinked', 'manual', 'none', '${at}')`)).rejects.toThrow();
    await expect(handle.exec(`insert into line_factory_links (id, created_at, updated_at, order_line_id, factory_party_id, status, source, confidence, linked_at) values ('l2', '${at}', '${at}', 'line-1', null, 'weird', 'manual', 'none', '${at}')`)).rejects.toThrow();
  } finally {
    await handle.close();
  }
});

async function applySqlFile(handle: AppHandle, name: string): Promise<void> {
  const text = readFileSync(new URL(`../../packages/persistence/src/migrations/${name}`, import.meta.url), 'utf8');
  for (const statement of text.split('--> statement-breakpoint')) {
    const sql = statement.trim();
    if (sql !== '') await handle.exec(sql);
  }
}

async function count(handle: AppHandle, table: string): Promise<number> {
  const rows = rowsOf(await handle.exec(`select count(*)::int as n from ${table}`));
  return Number(rows[0]?.n ?? -1);
}

async function columnNames(handle: AppHandle, table: string): Promise<string[]> {
  const rows = rowsOf(await handle.exec(`select column_name from information_schema.columns where table_schema = 'public' and table_name = '${table}'`));
  return rows.map((row) => String(row.column_name));
}

function rowsOf(result: unknown): readonly Record<string, unknown>[] {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter((row: unknown): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
