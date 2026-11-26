import { and, eq } from 'drizzle-orm';
import type { AuditLog as AuditPort } from '../../../application/src/ports/audit-log.js';
import type { AppDatabase } from '../client.js';
import { auditLog } from '../schema/platform.js';

export function auditRepository(db: AppDatabase): AuditPort {
  return {
    async record(entry) {
      await db.insert(auditLog).values({ id: crypto.randomUUID(), ...entry });
    },
    async hasEntry(input) {
      const rows = await db.select({ id: auditLog.id }).from(auditLog).where(and(
        eq(auditLog.entity, input.entity), eq(auditLog.entityId, input.entityId),
        eq(auditLog.action, input.action), eq(auditLog.actorUserId, input.actorUserId),
      )).limit(1);
      return rows.length > 0;
    },
  };
}

export async function countAudit(db: AppDatabase, entityId: string): Promise<number> {
  const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, entityId));
  return rows.length;
}
