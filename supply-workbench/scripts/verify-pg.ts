import { createRequire } from 'node:module';
import { MIGRATION_IDS, migrate } from '../packages/persistence/src/migrate.ts';

const url = process.env.DATABASE_URL;
if (url === undefined || url === '') {
  console.error('verify:pg 需要 DATABASE_URL。没有真实 PostgreSQL 时不能假装通过。');
  process.exit(2);
}

const require = createRequire(new URL('../packages/persistence/package.json', import.meta.url));
const pg = loadPg(require('pg'));
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });

try {
  await client.connect();
  await migrate((statement) => client.query(statement));
  const applied = idsOf(await client.query('select id from schema_migrations order by id'));
  assertMigrationSet(applied);
  await checkUnique(client);
  await checkPool(pg, url);
  console.log(`verify:pg ok: migrations=${applied.length} unique=ok pool=ok`);
} catch (error) {
  console.error(`verify:pg failed: ${messageOf(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}

type PgClient = {
  connect(): Promise<void>;
  query(statement: string): Promise<unknown>;
  end(): Promise<void>;
};

type PgPool = {
  query(statement: string): Promise<unknown>;
  end(): Promise<void>;
};

type PgApi = {
  Client: new (config: { readonly connectionString: string; readonly connectionTimeoutMillis: number }) => PgClient;
  Pool: new (config: { readonly connectionString: string; readonly max: number; readonly connectionTimeoutMillis: number }) => PgPool;
};

async function checkUnique(connection: PgClient): Promise<void> {
  await connection.query("delete from products where barcode_raw = 'VERIFY-PG-BARCODE'");
  const at = '2026-11-12T00:00:00.000Z';
  await connection.query('BEGIN');
  try {
    await connection.query(`INSERT INTO products (id, created_at, updated_at, barcode_raw, barcode_base, sku_name, field_sources) VALUES ('verify-pg-a', '${at}', '${at}', 'VERIFY-PG-BARCODE', 'VERIFY-PG-BARCODE', '验证产品', '{}'::jsonb)`);
    await connection.query('SAVEPOINT verify_unique');
    let code: string | undefined;
    let constraint: string | undefined;
    try {
      await connection.query(`INSERT INTO products (id, created_at, updated_at, barcode_raw, barcode_base, sku_name, field_sources) VALUES ('verify-pg-b', '${at}', '${at}', 'VERIFY-PG-BARCODE', 'VERIFY-PG-BARCODE', '验证产品', '{}'::jsonb)`);
    } catch (error) {
      code = readString(error, 'code');
      constraint = readString(error, 'constraint');
    }
    await connection.query('ROLLBACK TO SAVEPOINT verify_unique');
    if (code !== '23505' || constraint !== 'products_barcode_raw') throw new Error(`唯一约束没有拦住重复条码：code=${code ?? 'none'} constraint=${constraint ?? 'none'}`);
  } finally {
    await connection.query('ROLLBACK');
  }
}

async function checkPool(api: PgApi, connectionString: string): Promise<void> {
  const pool = new api.Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
  try {
    const results = await Promise.all([pool.query('select pg_sleep(0.05)'), pool.query('select pg_sleep(0.05)')]);
    for (const result of results) {
      if (rowsOf(result).length !== 1) throw new Error('连接池并发查询没有返回结果');
    }
  } finally {
    await pool.end();
  }
}

function assertMigrationSet(applied: readonly string[]): void {
  const expected = [...MIGRATION_IDS];
  const isSame = applied.length === expected.length && applied.every((id, index) => id === expected[index]);
  if (!isSame) throw new Error(`迁移集合不一致：expected=${expected.join(',')} actual=${applied.join(',')}`);
}

function idsOf(result: unknown): readonly string[] {
  return rowsOf(result).flatMap((row) => (typeof row.id === 'string' ? [row.id] : []));
}

function rowsOf(result: unknown): readonly Record<string, unknown>[] {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (!isRecord(candidate) || !Array.isArray(candidate.rows)) return [];
  const list: unknown[] = candidate.rows;
  return list.filter(isRecord);
}

function readString(error: unknown, field: string): string | undefined {
  if (!isRecord(error)) return undefined;
  const value = error[field];
  return typeof value === 'string' ? value : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadPg(value: unknown): PgApi {
  if (!isRecord(value) || !isClientConstructor(value.Client) || !isPoolConstructor(value.Pool)) throw new Error('pg 客户端不可用');
  return { Client: value.Client, Pool: value.Pool };
}

function isClientConstructor(value: unknown): value is PgApi['Client'] {
  return typeof value === 'function';
}

function isPoolConstructor(value: unknown): value is PgApi['Pool'] {
  return typeof value === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
