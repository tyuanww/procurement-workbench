import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { SqlExec } from '../packages/persistence/src/client.ts';
import { migrate } from '../packages/persistence/src/migrate.ts';

const zod = loadZod();

export function parseDatabaseCommand(input: { readonly command: string | undefined; readonly databaseUrl: string | undefined }): { readonly command: 'migrate' | 'seed'; readonly databaseUrl: string } {
  const command = commandOf(zod.enum(['migrate', 'seed'], { error: '命令只能是 migrate 或 seed' }).parse(input.command));
  const databaseUrl = urlOf(zod.string({ error: '必须设置 DATABASE_URL' }).min(1, { error: '必须设置 DATABASE_URL' }).parse(input.databaseUrl));
  return { command, databaseUrl };
}

export async function runDatabaseCommand(input: { readonly command: string | undefined; readonly databaseUrl: string | undefined }): Promise<void> {
  const parsed = parseDatabaseCommand(input);
  const client = openPgClient(parsed.databaseUrl);
  await client.connect();
  try {
    await applyCommand(parsed.command, (statement) => client.query(statement));
  } finally {
    await client.end();
  }
}

export async function seedIfEmpty(exec: SqlExec): Promise<'seeded' | 'skipped'> {
  await exec('BEGIN');
  try {
    return await seedUnderLock(exec);
  } catch (error) {
    await exec('ROLLBACK');
    throw error;
  }
}

async function seedUnderLock(exec: SqlExec): Promise<'seeded' | 'skipped'> {
  await exec('LOCK TABLE users IN EXCLUSIVE MODE');
  const result = await exec('select id from users limit 1');
  if (hasRow(result)) {
    await exec('COMMIT');
    return 'skipped';
  }
  const { seed } = await import('../packages/persistence/src/seed.ts');
  await seed(exec);
  await exec('COMMIT');
  return 'seeded';
}

async function applyCommand(command: 'migrate' | 'seed', exec: SqlExec): Promise<void> {
  if (command === 'migrate') {
    await migrate(exec);
    return;
  }
  await seedIfEmpty(exec);
}

type PgClient = {
  connect(): Promise<void>;
  query(statement: string): Promise<unknown>;
  end(): Promise<void>;
};

type ZodParse = { parse(value: unknown): unknown };
type ZodApi = {
  enum(values: readonly ['migrate', 'seed'], params: { readonly error: string }): ZodParse;
  string(params: { readonly error: string }): { min(length: number, params: { readonly error: string }): ZodParse };
  ZodError: abstract new (...args: never[]) => { readonly issues: ReadonlyArray<{ readonly message: string }> };
};

function loadZod(): ZodApi {
  const require = createRequire(new URL('../packages/contracts/package.json', import.meta.url));
  const loaded: unknown = require('zod');
  if (!isZodApi(loaded)) throw new Error('zod 不可用');
  return loaded;
}

function isZodApi(value: unknown): value is ZodApi {
  return isRecord(value) && typeof value.enum === 'function' && typeof value.string === 'function' && typeof value.ZodError === 'function';
}

function commandOf(value: unknown): 'migrate' | 'seed' {
  if (value === 'migrate' || value === 'seed') return value;
  throw new Error('命令只能是 migrate 或 seed');
}

function urlOf(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value;
  throw new Error('必须设置 DATABASE_URL');
}

function openPgClient(databaseUrl: string): PgClient {
  const require = createRequire(new URL('../packages/persistence/package.json', import.meta.url));
  return new (pgClientConstructor(require('pg')))({ connectionString: databaseUrl });
}

function pgClientConstructor(loaded: unknown): new (config: { readonly connectionString: string }) => PgClient {
  if (!isRecord(loaded) || !isPgConstructor(loaded.Client)) throw new Error('pg 客户端不可用');
  return loaded.Client;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPgConstructor(value: unknown): value is new (config: { readonly connectionString: string }) => PgClient {
  return typeof value === 'function';
}

function hasRow(result: unknown): boolean {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return false;
  return candidate.rows.length > 0;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

function report(error: unknown): never {
  if (error instanceof zod.ZodError) console.error(error.issues.map((issue) => issue.message).join('；'));
  else if (error instanceof Error) console.error(error.message);
  else console.error('数据库命令失败');
  process.exit(1);
}

if (isDirectRun()) {
  runDatabaseCommand({ command: process.argv[2], databaseUrl: process.env.DATABASE_URL }).catch(report);
}
