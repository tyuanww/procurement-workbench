import { readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createDb } from '../../packages/persistence/src/client.js';
import { currentMigration, migrate } from '../../packages/persistence/src/migrate.js';

it('每个迁移文件在同一条语句里加锁、执行并记录', async () => {
  const handle = await createDb({ driver: 'pglite' });
  const seen: string[] = [];
  try {
    await migrate(async (statement) => {
      seen.push(statement);
      return handle.exec(statement);
    });
    const locked = seen.filter((statement) => statement.includes('pg_advisory_xact_lock'));
    const files = readdirSync(new URL('../../packages/persistence/src/migrations/', import.meta.url)).filter((name) => name.endsWith('.sql'));
    expect(locked.length).toBe(files.length);
    expect(locked.every((statement) => statement.includes('INSERT INTO schema_migrations'))).toBe(true);
    expect(await currentMigration(handle.exec)).toBeDefined();
  } finally {
    await handle.close();
  }
});

it('建 schema_migrations 的语句同时持有 advisory lock', async () => {
  const handle = await createDb({ driver: 'pglite' });
  const seen: string[] = [];
  try {
    await migrate(async (statement) => {
      seen.push(statement);
      return handle.exec(statement);
    });
    const create = seen.find((statement) => statement.includes('CREATE TABLE IF NOT EXISTS schema_migrations'));
    expect(create).toContain('pg_advisory_xact_lock');
  } finally {
    await handle.close();
  }
});

it('后一个迁移文件失败时，前面已经执行的文件也不留下', async () => {
  const handle = await createDb({ driver: 'pglite' });
  let files = 0;
  try {
    await expect(migrate(async (statement) => {
      if (statement.includes('pg_advisory_xact_lock')) {
        files += 1;
        if (files === 2) throw new Error('第二个迁移文件失败');
      }
      return handle.exec(statement);
    })).rejects.toThrow('第二个迁移文件失败');
    expect(await hasMigration(handle.exec, '0000_init')).toBe(false);
    expect(await hasTable(handle.exec, 'audit_log')).toBe(false);
    expect(await hasTable(handle.exec, 'name_decisions')).toBe(false);
  } finally {
    await handle.close();
  }
});

it('单个迁移文件中途失败时回滚该文件，并且不记入 schema_migrations', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await handle.exec('create table code_links (id text primary key)');
    await expect(migrate(handle.exec)).rejects.toThrow();
    expect(await hasTable(handle.exec, 'audit_log')).toBe(false);
    expect(await hasMigration(handle.exec, '0000_init')).toBe(false);
  } finally {
    await handle.close();
  }
});

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
