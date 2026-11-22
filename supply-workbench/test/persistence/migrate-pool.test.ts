import { expect, it } from 'vitest';
import type { SqlExec } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';

it('pg 连接池上的迁移从取出到归还只用一条连接', async () => {
  const pool = roundRobinPool();
  const handle = pgHandle(pool);
  await migrate(handle);
  const ids = pool.log.filter((entry) => entry.sql === 'BEGIN' || entry.sql === 'COMMIT' || entry.sql.includes('pg_advisory_xact_lock')).map((entry) => entry.connectionId);
  expect(new Set(ids).size).toBe(1);
  expect(pool.checkouts).toBe(1);
  expect(pool.openCheckouts).toBe(0);
});

type LogEntry = { readonly connectionId: number; readonly sql: string };

function roundRobinPool() {
  const log: LogEntry[] = [];
  let next = 0;
  let checkouts = 0;
  let openCheckouts = 0;
  const queryOn = (connectionId: number): SqlExec => async (sql) => {
    log.push({ connectionId, sql });
    if (sql.startsWith('SAVEPOINT') || sql.startsWith('RELEASE SAVEPOINT')) throw new Error('不在事务里');
    return { rows: [] };
  };
  return {
    log,
    get checkouts() { return checkouts; },
    get openCheckouts() { return openCheckouts; },
    query: queryOn(0),
    async connect() {
      const connectionId = next;
      next += 1;
      checkouts += 1;
      openCheckouts += 1;
      return {
        query: queryOn(connectionId),
        release() { openCheckouts -= 1; },
      };
    },
  };
}

function pgHandle(pool: ReturnType<typeof roundRobinPool>) {
  return {
    session: async () => {
      const client = await pool.connect();
      return { exec: client.query, release: () => client.release() };
    },
  };
}
