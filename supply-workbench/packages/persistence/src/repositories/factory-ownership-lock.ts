import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';

export async function lockFactoryOwnershipChange(db: AppDatabase, orderLineIds: readonly (string | null)[]): Promise<void> {
  const ids = [...new Set(orderLineIds)].filter((id) => id !== null).sort();
  for (const id of ids) await db.execute(sql`select pg_advisory_xact_lock(${ownershipKey(id)})`);
}

export async function tryLockFactoryOwnershipForEvidence(db: AppDatabase, orderLineId: string): Promise<boolean> {
  const result = await db.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock_shared(${ownershipKey(orderLineId)}) as locked`);
  return result.rows[0]?.locked === true;
}

function ownershipKey(orderLineId: string) {
  return sql`hashtextextended('supply.follow-up.factory-ownership:' || ${orderLineId}, 0)`;
}
