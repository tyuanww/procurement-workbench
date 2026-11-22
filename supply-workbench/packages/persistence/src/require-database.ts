import type { AppDatabase } from './client.js';

/**
 * pg 和 pglite 的 drizzle 事务对象不属于 AppDatabase 这个联合类型，
 * 但仓库只调用两边都有的 insert 和 select。核对这两个方法后，在这一处收成 AppDatabase。
 */
export function requireDatabase(tx: unknown): AppDatabase {
  if (!hasQueryApi(tx)) throw new Error('事务不是数据库');
  return databaseOf(tx);
}

function hasQueryApi(tx: unknown): tx is { readonly insert: unknown; readonly select: unknown } {
  return typeof tx === 'object' && tx !== null && 'insert' in tx && 'select' in tx;
}

function databaseOf(tx: { readonly insert: unknown; readonly select: unknown }): AppDatabase {
  return tx as AppDatabase;
}
