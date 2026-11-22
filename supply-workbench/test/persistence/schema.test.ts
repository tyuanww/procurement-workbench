import { beforeAll, expect, it } from 'vitest';
import type { User } from '../../packages/domain/src/entities/records.js';
import { createDb, type AppHandle } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { deliveryBatchRepository } from '../../packages/persistence/src/repositories/delivery-batches.js';
import { placeholderStores } from '../../packages/persistence/src/repositories/index.js';
import { seed } from '../../packages/persistence/src/seed.js';
import { createUnitOfWork, type RollbackJournal } from '../../packages/persistence/src/unit-of-work.js';
import { describeUnitOfWorkContract } from '../../packages/testkit/src/index.js';

let handle: AppHandle;

beforeAll(async () => {
  handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
});

describeUnitOfWorkContract(() => {
  const users = new Map<string, User>();
  const audits: unknown[] = [];
  const uow = createUnitOfWork(handle.db, (_tx, journal) => journalingStores({ users, audits, journal }));
  return {
    ...uow,
    readUser: async (id: string) => users.get(id),
    auditCount: () => audits.length,
  };
});

it('迁移跑两次不失败，并记下版本', async () => {
  await migrate(handle.exec);
  expect(await text(`select id as n from schema_migrations where id = '0000_init'`)).toBe('0000_init');
  expect(await text(`select id as n from schema_migrations where id = '0001_name_decisions'`)).toBe('0001_name_decisions');
});

it('种子数据跑两次，用户、仓库和设置不变', async () => {
  await seed(handle.exec);
  await seed(handle.exec);
  expect(await scalar(`select count(*)::int as n from users`)).toBe(6);
  expect(await scalar(`select count(*)::int as n from parties where is_own_warehouse`)).toBe(1);
  expect(await text(`select own_warehouse_party_id::text as n from settings`)).toBe('0199f0a0-0000-7000-8000-000000000010');
});

it('送货单读到未回传时拒绝，不当成已回传', async () => {
  const at = '2026-10-12T00:00:00.000Z';
  await handle.exec(`insert into delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, receiver_party_id, status, status_changed_at, origin) values ('batch-missing-note', '${at}', '${at}', 'line-1', 1, 1, 'party-1', 'awaiting_date', '${at}', 'manual')`);
  await handle.exec(`insert into delivery_notes (id, created_at, updated_at, batch_id, status, created_by) values ('note-missing', '${at}', '${at}', 'batch-missing-note', 'missing', 'user-1')`);
  await expect(deliveryBatchRepository(handle.db).getWithRecords('batch-missing-note')).rejects.toThrow(/未回传/);
});

it('别名、编码和产品条码不能重复', async () => {
  await insertAlias('same-name');
  await expect(insertAlias('same-name')).rejects.toThrow();
  await insertCode('erp_70', '70007017');
  await expect(insertCode('erp_70', '70007017')).rejects.toThrow();
  await insertProduct('2000000003023');
  await expect(insertProduct('2000000003023')).rejects.toThrow();
});

it('业务日期列是 date，创建时间是 timestamptz', async () => {
  expect(await columnType('shipments', 'shipped_on')).toBe('date');
  expect(await columnType('delivery_batches', 'date_buyer_confirmed')).toBe('date');
  expect(await columnType('factory_in_transit_rows', 'ordered_on')).toBe('date');
  expect(await columnType('weekly_reports', 'week_start')).toBe('date');
  expect(await columnType('users', 'created_at')).toBe('timestamp with time zone');
});

function journalingStores({ users, audits, journal }: { readonly users: Map<string, User>; readonly audits: unknown[]; readonly journal: RollbackJournal }) {
  const stores = placeholderStores();
  return {
    ...stores,
    users: {
      ...stores.users,
      async save(user: User) {
        const previous = users.get(user.id);
        journal.undo(() => {
          if (previous === undefined) users.delete(user.id);
          else users.set(user.id, previous);
        });
        users.set(user.id, user);
      },
    },
    audit: {
      async record(entry: unknown) {
        journal.undo(() => {
          audits.pop();
        });
        audits.push(entry);
      },
    },
  };
}

async function scalar(statement: string): Promise<number> {
  const row = await one(statement);
  return Number(row.n);
}

async function text(statement: string): Promise<string> {
  const row = await one(statement);
  return String(row.n);
}

async function columnType(table: string, column: string): Promise<string> {
  const row = await one(`select data_type as n from information_schema.columns where table_name = '${table}' and column_name = '${column}'`);
  return String(row.n);
}

async function one(statement: string): Promise<{ n: unknown }> {
  const result = await handle.exec(statement);
  const rows = rowsOf(result);
  const row = rows[0];
  if (row === undefined) throw new Error(`没有行: ${statement}`);
  return row;
}

function rowsOf(result: unknown): Array<{ n: unknown }> {
  if (!Array.isArray(result)) return rowsFrom(result);
  return rowsFrom(result[0]);
}

function rowsFrom(result: unknown): Array<{ n: unknown }> {
  if (typeof result !== 'object' || result === null || !('rows' in result)) return [];
  const rows = result.rows;
  return Array.isArray(rows) ? rows.filter(hasN) : [];
}

function hasN(row: unknown): row is { n: unknown } {
  return typeof row === 'object' && row !== null && 'n' in row;
}

async function insertAlias(normName: string): Promise<void> {
  await handle.exec(`insert into party_aliases (id, created_at, updated_at, raw_name, norm_name, status, seen_count) values ('${crypto.randomUUID()}', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z', '${normName}', '${normName}', 'pending', 1)`);
}

async function insertCode(codeType: string, codeNorm: string): Promise<void> {
  await handle.exec(`insert into item_codes (id, created_at, updated_at, code_type, code_raw, code_norm, status) values ('${crypto.randomUUID()}', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z', '${codeType}', '${codeNorm}', '${codeNorm}', 'pending')`);
}

async function insertProduct(barcode: string): Promise<void> {
  await handle.exec(`insert into products (id, created_at, updated_at, barcode_raw, barcode_base, sku_name, field_sources) values ('${crypto.randomUUID()}', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z', '${barcode}', '${barcode}', '海葡萄', '{}'::jsonb)`);
}
