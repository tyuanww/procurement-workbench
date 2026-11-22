import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppHandle, SqlExec, SqlSession } from './client.js';

const BREAK = '--> statement-breakpoint';
const INIT = '0000_init';
const MIGRATION_DIRECTORY = fileURLToPath(new URL('./migrations', import.meta.url));
const MIGRATION_FILE = /^(\d{4}_[a-z0-9_]+)\.sql$/;
const PARTIAL_INIT = '数据库只完成部分初始化：0000_init 的表或索引不齐。请从备份恢复或人工补齐后重试，不能把 0000_init 标记为已应用。';

const SAVEPOINT = 'sw_migrate';

export type MigrationFile = { readonly id: string; readonly path: string };

export const MIGRATIONS = discoverMigrations();
export const MIGRATION_IDS: readonly string[] = MIGRATIONS.map((file) => file.id);
export const LATEST_MIGRATION = MIGRATION_IDS[MIGRATION_IDS.length - 1] ?? INIT;

export function discoverMigrations(directory: string = MIGRATION_DIRECTORY): readonly MigrationFile[] {
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => ({ name: entry.name, path: path.join(directory, entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry, index) => migrationFileOf(entry, index));
  if (files[0]?.id !== INIT) throw new Error(`首个迁移必须是 ${INIT}`);
  return files;
}

function migrationFileOf(entry: { readonly name: string; readonly path: string }, index: number): MigrationFile {
  const match = MIGRATION_FILE.exec(entry.name);
  const id = match?.[1];
  if (id === undefined) throw new Error(`未知迁移文件 ${entry.name}`);
  if (Number(id.slice(0, 4)) !== index) throw new Error(`迁移编号不连续或重复 ${entry.name}`);
  return { id, path: entry.path };
}

export async function migrate(target: SqlExec | Pick<AppHandle, 'session'>, migrations: readonly MigrationFile[] = MIGRATIONS): Promise<void> {
  if (isHandle(target)) {
    const session = await target.session();
    try {
      await migrateSession(session.exec, migrations);
    } finally {
      session.release();
    }
    return;
  }
  await migrateSession(target, migrations);
}

async function migrateSession(exec: SqlExec, migrations: readonly MigrationFile[]): Promise<void> {
  const shouldOpenTransaction = !(await hasOpenTransaction(exec));
  if (shouldOpenTransaction) await exec('BEGIN');
  else await exec(`SAVEPOINT ${SAVEPOINT}`);
  try {
    for (const file of migrations) {
      await exec(migrationScript({ id: file.id, statements: statementsOf(file.path), isInit: file.id === INIT }));
    }
    if (shouldOpenTransaction) await exec('COMMIT');
    else await exec(`RELEASE SAVEPOINT ${SAVEPOINT}`);
  } catch (error) {
    if (shouldOpenTransaction) await exec('ROLLBACK');
    else await exec(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
    throw error;
  }
}

function isHandle(value: SqlExec | Pick<AppHandle, 'session'>): value is { session(): Promise<SqlSession> } {
  return typeof value !== 'function';
}

async function hasOpenTransaction(exec: SqlExec): Promise<boolean> {
  try {
    await exec('SAVEPOINT sw_migrate_probe');
    await exec('RELEASE SAVEPOINT sw_migrate_probe');
    return true;
  } catch {
    return false;
  }
}

export async function currentMigration(exec: SqlExec): Promise<string | undefined> {
  return latestMigrationOf(new Set(await appliedMigrations(exec)));
}

export async function appliedMigrations(exec: SqlExec): Promise<readonly string[]> {
  const result = await exec(`select id from schema_migrations`);
  return rowsOf(result).map((row) => row.id).filter((id): id is string => typeof id === 'string');
}

export function latestMigrationOf(applied: ReadonlySet<string>): string | undefined {
  for (let index = MIGRATION_IDS.length - 1; index >= 0; index -= 1) {
    const id = MIGRATION_IDS[index];
    if (id !== undefined && applied.has(id)) return id;
  }
  return undefined;
}

function migrationScript(input: { readonly id: string; readonly statements: readonly string[]; readonly isInit: boolean }): string {
  const body = input.isInit ? initBody(input.statements) : input.statements.map(executeLine).join('\n');
  const marker = dollarTag(body, 'swmigrate');
  return `DO ${marker}
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('supply'), hashtext('migrate'));
  EXECUTE 'CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())';
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE id = '${input.id}') THEN
    RETURN;
  END IF;
  ${body}
  INSERT INTO schema_migrations (id) VALUES ('${input.id}');
END
${marker};`;
}

function initBody(statements: readonly string[]): string {
  const ddl = statements.map(executeLine).join('\n    ');
  const missing = [
    ...tableNames(statements).map((name) => `NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${name}')`),
    ...indexNames(statements).map((name) => `NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = '${name}')`),
  ].join('\n      OR ');
  return `IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    IF ${missing} THEN
      RAISE EXCEPTION '${PARTIAL_INIT}';
    END IF;
  ELSE
    ${ddl}
  END IF;`;
}

function tableNames(statements: readonly string[]): string[] {
  return statements.flatMap((statement) => {
    const match = /CREATE TABLE "([^"]+)"/.exec(statement);
    return match?.[1] === undefined ? [] : [match[1]];
  });
}

function indexNames(statements: readonly string[]): string[] {
  return statements.flatMap((statement) => {
    const match = /CREATE (?:UNIQUE )?INDEX "([^"]+)"/.exec(statement);
    return match?.[1] === undefined ? [] : [match[1]];
  });
}

function executeLine(statement: string): string {
  const marker = dollarTag(statement, 'stmt');
  return `EXECUTE ${marker}${statement}${marker};`;
}

function dollarTag(text: string, seed: string): string {
  let marker = `$${seed}$`;
  let index = 0;
  while (text.includes(marker)) {
    index += 1;
    marker = `$${seed}${index}$`;
  }
  return marker;
}

function statementsOf(file: string): string[] {
  return readFileSync(file, 'utf8').split(BREAK).map((part) => part.trim()).filter((part) => part !== '');
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter(isRow);
}

function isRow(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null;
}
