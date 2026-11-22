import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createDb } from '../../packages/persistence/src/client.js';
import { currentMigration, LATEST_MIGRATION, migrate } from '../../packages/persistence/src/migrate.js';

it('0006 记录丢失后重跑迁移不会因已存在约束而永久失败', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    await handle.exec("delete from schema_migrations where id = '0006_import_enum_checks'");
    await migrate(handle.exec);
    expect(await currentMigration(handle.exec)).toBe(LATEST_MIGRATION);
  } finally {
    await handle.close();
  }
});

it('只建到 users 的半初始化库不会被静默标记为 0000 已应用', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await handle.exec('create table users (id text primary key)');
    await expect(migrate(handle.exec)).rejects.toThrow('部分初始化');
  } finally {
    await handle.close();
  }
});

it('users 和 import_batches 都在、后面的表还没有时，不能把 0000 记成已应用', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await handle.exec('create table users (id text primary key)');
    await handle.exec('create table import_batches (id text primary key)');
    await expect(migrate(handle.exec)).rejects.toThrow('部分初始化');
    expect(await hasMigration(handle.exec, '0000_init')).toBe(false);
    expect(await hasTable(handle.exec, 'products')).toBe(false);
  } finally {
    await handle.close();
  }
});

it('表都在但唯一索引缺失时，不把 0000 记成已应用', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    const sql = readFileSync(new URL('../../packages/persistence/src/migrations/0000_init.sql', import.meta.url), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed.startsWith('CREATE TABLE')) await handle.exec(trimmed);
    }
    await expect(migrate(handle.exec)).rejects.toThrow('部分初始化');
    expect(await hasMigration(handle.exec, '0000_init')).toBe(false);
    expect(await hasIndex(handle.exec, 'products_barcode_raw')).toBe(false);
  } finally {
    await handle.close();
  }
});

async function hasIndex(exec: (statement: string) => Promise<unknown>, name: string): Promise<boolean> {
  const result = await exec(`select indexname from pg_indexes where schemaname = 'public' and indexname = '${name}'`);
  return rows(result).some((row) => row.indexname === name);
}

async function hasTable(exec: (statement: string) => Promise<unknown>, table: string): Promise<boolean> {
  const result = await exec(`select table_name from information_schema.tables where table_schema = 'public' and table_name = '${table}'`);
  return rows(result).some((row) => row.table_name === table);
}

async function hasMigration(exec: (statement: string) => Promise<unknown>, id: string): Promise<boolean> {
  if (!(await hasTable(exec, 'schema_migrations'))) return false;
  const result = await exec(`select id from schema_migrations where id = '${id}'`);
  return rows(result).some((row) => row.id === id);
}

function rows(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter(isRow);
}

function isRow(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null;
}
