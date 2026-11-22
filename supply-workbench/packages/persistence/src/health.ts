import type { SqlExec } from './client.js';
import { appliedMigrations, latestMigrationOf, MIGRATION_IDS } from './migrate.js';

export type DatabaseHealth = { readonly ok: boolean; readonly db: 'up' | 'down'; readonly migration: string };

export async function databaseHealth(exec: SqlExec): Promise<DatabaseHealth> {
  try {
    return healthOf(new Set(await appliedMigrations(exec)));
  } catch {
    return { ok: false, db: 'down', migration: 'unknown' };
  }
}

function healthOf(applied: ReadonlySet<string>): DatabaseHealth {
  const migration = latestMigrationOf(applied);
  if (migration === undefined) return { ok: false, db: 'down', migration: 'none' };
  return { ok: isComplete(applied), db: 'up', migration };
}

function isComplete(applied: ReadonlySet<string>): boolean {
  return applied.size === MIGRATION_IDS.length && MIGRATION_IDS.every((id) => applied.has(id));
}
