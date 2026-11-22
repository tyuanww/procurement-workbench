import { expect, it } from 'vitest';
import { createDb, type SqlExec } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { parseDatabaseCommand, seedIfEmpty } from '../../scripts/db-lifecycle.js';

it('显式命令只接受 migrate 和 seed，并且必须有数据库地址', () => {
  expect(parseDatabaseCommand({ command: 'migrate', databaseUrl: 'postgres://local/sw' }).command).toBe('migrate');
  expect(parseDatabaseCommand({ command: 'seed', databaseUrl: 'postgres://local/sw' }).command).toBe('seed');
  expect(() => parseDatabaseCommand({ command: 'drop', databaseUrl: 'postgres://local/sw' })).toThrow();
  expect(() => parseDatabaseCommand({ command: 'migrate', databaseUrl: undefined })).toThrow();
});

it('空库判断和演示账号写入在同一把表锁里', async () => {
  const handle = await createDb({ driver: 'pglite' });
  const seen: string[] = [];
  try {
    await migrate(handle.exec);
    const exec: SqlExec = async (statement) => {
      seen.push(statement);
      return handle.exec(statement);
    };
    expect(await seedIfEmpty(exec)).toBe('seeded');
    const begin = seen.indexOf('BEGIN');
    const lock = seen.findIndex((statement) => statement.includes('LOCK TABLE users'));
    const look = seen.findIndex((statement) => statement.includes('select id from users'));
    const insert = seen.findIndex((statement) => statement.startsWith('INSERT INTO users'));
    const commit = seen.lastIndexOf('COMMIT');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(begin);
    expect(look).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(look);
    expect(commit).toBeGreaterThan(insert);
  } finally {
    await handle.close();
  }
});

it('seed 只在空库初始化时写入，已有用户则跳过', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    expect(await seedIfEmpty(handle.exec)).toBe('seeded');
    expect(await seedIfEmpty(handle.exec)).toBe('skipped');
  } finally {
    await handle.close();
  }
});
