import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { assertDatabaseConnected } from '../../apps/server/src/main.js';
import { createDb } from '../../packages/persistence/src/client.js';

const source = readFileSync(new URL('../../apps/server/src/main.ts', import.meta.url), 'utf8');

it('应用启动不调用 migrate 或 seed，只做连接检查', () => {
  const body = mainBody(source);
  expect(body).not.toContain('migrate(');
  expect(body).not.toContain('seed(');
  expect(body).toContain('assertDatabaseConnected(');
  expect(source).toContain("exec('select 1')");
});

it('连接检查不创建 schema_migrations', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await assertDatabaseConnected(handle.exec);
    const result = await handle.exec(`select to_regclass('public.schema_migrations') as name`);
    expect(relationName(result)).toBeNull();
  } finally {
    await handle.close();
  }
});

function relationName(result: unknown): string | null {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return null;
  const row = candidate.rows[0];
  if (typeof row !== 'object' || row === null || !('name' in row)) return null;
  return typeof row.name === 'string' ? row.name : null;
}

function mainBody(text: string): string {
  const start = text.indexOf('export async function main');
  const next = text.indexOf('\nfunction ', start);
  return text.slice(start, next);
}
