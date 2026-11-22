import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const root = new URL('../..', import.meta.url);
const lifecycle = readFileSync(new URL('scripts/db-lifecycle.ts', root), 'utf8');
const pkg = readFileSync(new URL('package.json', root), 'utf8');
const acceptance = readFileSync(new URL('e2e/native-acceptance.ts', root), 'utf8');

it('迁移入口指向存在的持久化模块', () => {
  expect(lifecycle).toContain('packages/persistence/src/migrate.ts');
  expect(existsSync(new URL('packages/persistence/src/migrate.ts', root))).toBe(true);
});

it('db:migrate 执行迁移命令', () => {
  const command = migrateCommand(pkg);
  expect(command).toContain('scripts/db-lifecycle.ts migrate');
});

it('空库 e2e 只启动一次 PostgreSQL，依次迁移、种数据、启动应用并检查健康', () => {
  const start = "'-w', 'start'";
  const dbAt = acceptance.indexOf(start);
  const lifecycleAt = acceptance.indexOf("['migrate', 'seed']");
  const appAt = acceptance.indexOf("fork('docker/start.ts'");
  const healthAt = acceptance.indexOf('/api/v1/health');
  expect(dbAt).toBeGreaterThan(-1);
  expect(acceptance.lastIndexOf(start)).toBe(dbAt);
  expect(lifecycleAt).toBeGreaterThan(dbAt);
  expect(appAt).toBeGreaterThan(lifecycleAt);
  expect(healthAt).toBeGreaterThan(appAt);
});

function migrateCommand(text: string): string {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || !isRecord(parsed.scripts)) throw new Error('package.json 没有 scripts');
  const command = parsed.scripts['db:migrate'];
  if (typeof command !== 'string') throw new Error('package.json 没有 db:migrate');
  return command;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
