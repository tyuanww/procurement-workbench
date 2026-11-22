import { eq } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import type { Party, PartyAlias } from '@sw/domain';
import type { PartyAliasRepository } from '../../../application/src/ports/party-alias-repository.js';
import type { PartyRepository } from '../../../application/src/ports/party-repository.js';
import type { AppDatabase } from '../client.js';
import { parties, partyAliases } from '../schema/platform.js';
import { entityId, entityIdOrNull } from '../mappers/id.js';
import { instant, instantOrNull } from '../mappers/time.js';

export function partyRepository(db: AppDatabase): PartyRepository {
  return {
    async get(id) {
      const found = await findParty(db, id);
      if (found === undefined) throw new NotFoundError('主体', id);
      return found;
    },
    find: (id) => findParty(db, id),
    async save(entity) {
      await db.insert(parties).values(entity).onConflictDoUpdate({ target: parties.id, set: entity });
    },
  };
}

async function findParty(db: AppDatabase, id: string): Promise<Party | undefined> {
  const row = (await db.select().from(parties).where(eq(parties.id, id)))[0];
  return row === undefined ? undefined : { ...row, id: entityId(row.id), createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt) };
}

export function aliasRepository(db: AppDatabase): PartyAliasRepository {
  return {
    async get(id) {
      const found = await findAlias(db, id);
      if (found === undefined) throw new NotFoundError('别名', id);
      return found;
    },
    find: (id) => findAlias(db, id),
    async findByNormName(normName) {
      return aliasOfRow((await db.select().from(partyAliases).where(eq(partyAliases.normName, normName)))[0]);
    },
    async save(entity) {
      const seenBatchCount = entity.seenBatchCount === undefined ? 0 : entity.seenBatchCount;
      await db.insert(partyAliases).values({ ...entity, seenBatchCount }).onConflictDoUpdate({ target: partyAliases.id, set: { ...entity, seenBatchCount } });
    },
  };
}

async function findAlias(db: AppDatabase, id: string): Promise<PartyAlias | undefined> {
  return aliasOfRow((await db.select().from(partyAliases).where(eq(partyAliases.id, id)))[0]);
}

function aliasOfRow(row: typeof partyAliases.$inferSelect | undefined): PartyAlias | undefined {
  if (row === undefined) return undefined;
  return { ...row, id: entityId(row.id), partyId: entityIdOrNull(row.partyId), firstSeenImportBatchId: entityIdOrNull(row.firstSeenImportBatchId), reviewedBy: entityIdOrNull(row.reviewedBy), status: row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending', ...(row.seenBatchCount === undefined || row.seenBatchCount === 0 ? {} : { seenBatchCount: row.seenBatchCount }), createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt), reviewedAt: instantOrNull(row.reviewedAt) };
}
