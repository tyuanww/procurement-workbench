import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { createDb } from '../../packages/persistence/src/client.js';
import { appliedMigrations, discoverMigrations, LATEST_MIGRATION, migrate } from '../../packages/persistence/src/migrate.js';

const source = fileURLToPath(new URL('../../packages/persistence/src/migrations/', import.meta.url));
const created: string[] = [];

afterEach(async () => {
  for (const dir of created.splice(0)) await rm(dir, { recursive: true, force: true });
});

it('新增迁移只加文件就会执行，不用改手写数组', async () => {
  const dir = await copyOfMigrations();
  const probeId = `${numberedMigration(discoverMigrations(dir).length)}_probe_table`;
  await writeFile(path.join(dir, `${probeId}.sql`), 'CREATE TABLE "migration_probe" ("id" text PRIMARY KEY NOT NULL);');
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec, discoverMigrations(dir));
    expect(await appliedMigrations(handle.exec)).toContain(probeId);
    expect(await hasTable(handle.exec, 'migration_probe')).toBe(true);
  } finally {
    await handle.close();
  }
});

it('现有迁移清单来自迁移目录，且编号连续', () => {
  const ids = discoverMigrations().map((file) => file.id);
  const files = readdirSync(source).filter((name) => name.endsWith('.sql')).sort();
  expect(ids).toEqual(files.map((name) => name.slice(0, -'.sql'.length)));
  expect(ids[0]).toBe('0000_init');
  expect(ids.at(-1)).toBe(LATEST_MIGRATION);
});

it('编号跳号时发现迁移明确失败', async () => {
  const dir = await copyOfMigrations();
  const skipped = numberedMigration(discoverMigrations(dir).length + 1);
  await writeFile(path.join(dir, `${skipped}_probe_table.sql`), 'CREATE TABLE "migration_probe" ("id" text);');
  expect(() => discoverMigrations(dir)).toThrow('迁移编号');
});

it('同一编号出现两个文件时明确失败', async () => {
  const dir = await copyOfMigrations();
  const duplicate = numberedMigration(discoverMigrations(dir).length);
  await writeFile(path.join(dir, `${duplicate}_second.sql`), 'CREATE TABLE "migration_probe" ("id" text);');
  await writeFile(path.join(dir, `${duplicate}_third.sql`), 'CREATE TABLE "migration_probe2" ("id" text);');
  expect(() => discoverMigrations(dir)).toThrow('迁移编号');
});

it('未知前缀的 SQL 文件明确失败', async () => {
  const dir = await copyOfMigrations();
  await writeFile(path.join(dir, 'probe.sql'), 'CREATE TABLE "migration_probe" ("id" text);');
  expect(() => discoverMigrations(dir)).toThrow('未知迁移文件');
});

function numberedMigration(index: number): string {
  return String(index).padStart(4, '0');
}

async function copyOfMigrations(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sw-migrations-'));
  created.push(dir);
  await cp(source, dir, { recursive: true });
  return dir;
}

async function hasTable(exec: (statement: string) => Promise<unknown>, table: string): Promise<boolean> {
  const result = await exec(`select table_name from information_schema.tables where table_schema = 'public' and table_name = '${table}'`);
  return rows(result).some((row) => row.table_name === table);
}

function rows(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  const list: unknown[] = candidate.rows;
  return list.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
