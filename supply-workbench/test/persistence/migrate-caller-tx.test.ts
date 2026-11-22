import { expect, it } from 'vitest';
import { createDb } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';

it('调用方已经打开事务时，迁移不会替它提交', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await handle.exec('BEGIN');
    await handle.exec('create table caller_work (id int primary key)');
    await handle.exec('insert into caller_work values (1)');
    await migrate(handle.exec);
    await handle.exec('ROLLBACK');
    expect(await hasTable(handle.exec, 'caller_work')).toBe(false);
    expect(await hasMigration(handle.exec, '0000_init')).toBe(false);
  } finally {
    await handle.close();
  }
});

it('迁移中途失败时，调用方未提交的行还在', async () => {
  const handle = await createDb({ driver: 'pglite' });
  let files = 0;
  try {
    await handle.exec('BEGIN');
    await handle.exec('create table caller_work (id int primary key)');
    await handle.exec('insert into caller_work values (1)');
    await expect(migrate(async (statement) => {
      if (statement.includes('pg_advisory_xact_lock')) {
        files += 1;
        if (files === 2) throw new Error('第二个迁移文件失败');
      }
      return handle.exec(statement);
    })).rejects.toThrow('第二个迁移文件失败');
    expect(await scalar(handle.exec, 'select id from caller_work')).toBe(1);
    expect(await hasMigration(handle.exec, '0000_init')).toBe(false);
    await handle.exec('ROLLBACK');
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

async function scalar(exec: (statement: string) => Promise<unknown>, statement: string): Promise<unknown> {
  const result = await exec(statement);
  return rows(result)[0]?.id;
}

function rows(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter(isRow);
}

function isRow(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null;
}
