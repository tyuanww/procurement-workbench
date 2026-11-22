import { eq } from 'drizzle-orm';
import type { AuditLog as AuditPort } from '../../../application/src/ports/audit-log.js';
import type { AppDatabase } from '../client.js';
import { auditLog } from '../schema/platform.js';

export function auditRepository(db: AppDatabase): AuditPort {
  return {
    async record(entry) {
      await db.insert(auditLog).values({ id: crypto.randomUUID(), ...entry });
    },
  };
}

export async function countAudit(db: AppDatabase, entityId: string): Promise<number> {
  const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, entityId));
  return rows.length;
}
