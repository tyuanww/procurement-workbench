import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import pg from 'pg';
import * as schema from './schema/index.js';

export type SqlExec = (statement: string) => Promise<unknown>;

type PgliteDb = ReturnType<typeof drizzlePglite<typeof schema>>;
type PgDb = ReturnType<typeof drizzlePg<typeof schema>>;

export type AppDatabase = PgliteDb | PgDb;

export type SqlSession = {
  readonly exec: SqlExec;
  release(): void;
};

export type AppHandle = {
  readonly driver: 'pg' | 'pglite';
  readonly db: AppDatabase;
  readonly exec: SqlExec;
  session(): Promise<SqlSession>;
  close(): Promise<void>;
};

export async function createDb(input: { readonly driver: 'pg' | 'pglite'; readonly url?: string }): Promise<AppHandle> {
  if (input.driver === 'pglite') return pgliteDb();
  if (input.url === undefined) throw new Error('pg 驱动需要 url');
  return pgDb(input.url);
}

async function pgliteDb(): Promise<AppHandle> {
  const client = new PGlite();
  return {
    driver: 'pglite',
    db: drizzlePglite(client, { schema }),
    exec: (statement) => client.exec(statement),
    session: async () => ({ exec: (statement) => client.exec(statement), release() {} }),
    close: () => client.close(),
  };
}

const TIMESTAMPTZ_OID = 1184;
const TIMESTAMP_OID = 1114;

export function keepPgTimestampText(): void {
  pg.types.setTypeParser(TIMESTAMPTZ_OID, (value) => value);
  pg.types.setTypeParser(TIMESTAMP_OID, (value) => value);
}

function pgDb(url: string): AppHandle {
  keepPgTimestampText();
  const pool = new pg.Pool({ connectionString: url });
  return {
    driver: 'pg',
    db: drizzlePg(pool, { schema }),
    exec: (statement) => pool.query(statement),
    session: async () => {
      const client = await pool.connect();
      return { exec: (statement) => client.query(statement), release() { client.release(); } };
    },
    close: () => pool.end(),
  };
}
