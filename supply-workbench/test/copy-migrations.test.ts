import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { copyMigrations } from '../scripts/copy-migrations.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('构建把迁移 SQL 复制进 dist，旧文件不残留', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sw-migrations-'));
  created.push(root);
  const from = path.join(root, 'src');
  const to = path.join(root, 'dist');
  mkdirSync(from);
  writeFileSync(path.join(from, '0000_init.sql'), 'create table users();');
  mkdirSync(to);
  writeFileSync(path.join(to, 'stale.sql'), 'old');
  await copyMigrations(from, to);
  expect(readdirSync(to)).toEqual(['0000_init.sql']);
  expect(readFileSync(path.join(to, '0000_init.sql'), 'utf8')).toBe('create table users();');
});
