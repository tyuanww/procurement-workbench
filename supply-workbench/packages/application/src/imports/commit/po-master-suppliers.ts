import { isNotProvided, normalizeText, type EntityId, type PartyAlias } from '@sw/domain';
import { aliasOf } from '../use-cases/parse-batch.js';
import type { CommitContext } from './context.js';

export function poMasterSuppliers(ctx: CommitContext) {
  const names = new Map<string, { readonly rawName: string; readonly rowCount: number }>();
  const aliases = new Map<string, PartyAlias | undefined>();
  async function find(normName: string): Promise<PartyAlias | undefined> {
    if (aliases.has(normName)) return aliases.get(normName);
    const alias = await ctx.tx.aliases.findByNormName(normName);
    aliases.set(normName, alias);
    return alias;
  }
  return {
    observe(rawName: string | null): void {
      if (rawName === null || isNotProvided(rawName)) return;
      const normName = normalizeText(rawName);
      const current = names.get(normName);
      names.set(normName, current === undefined ? { rawName, rowCount: 1 } : { ...current, rowCount: current.rowCount + 1 });
    },
    async approvedPartyId(rawName: string | null): Promise<EntityId | null> {
      if (rawName === null || isNotProvided(rawName)) return null;
      const alias = await find(normalizeText(rawName));
      return alias?.status === 'approved' ? alias.partyId : null;
    },
    async saveObservations(): Promise<void> {
      for (const [normName, { rawName, rowCount }] of names) {
        const existing = await find(normName);
        const alias = aliasOf({ name: rawName, at: ctx.at, batchId: ctx.batch.id });
        await ctx.tx.aliases.save(existing === undefined
          ? { ...alias, seenCount: rowCount, seenBatchCount: 1 }
          : observedAlias({ existing, alias, rowCount }));
      }
    },
  };
}

export type PoMasterSuppliers = ReturnType<typeof poMasterSuppliers>;

function observedAlias({ existing, alias, rowCount }: { readonly existing: PartyAlias; readonly alias: PartyAlias; readonly rowCount: number }): PartyAlias {
  const previousBatches = existing.seenBatchCount === undefined ? 0 : existing.seenBatchCount;
  return {
    ...existing,
    ...(existing.status === 'pending' ? { rawName: alias.rawName, firstSeenImportBatchId: existing.firstSeenImportBatchId ?? alias.firstSeenImportBatchId } : {}),
    seenCount: existing.seenCount + rowCount,
    seenBatchCount: previousBatches + 1,
    updatedAt: alias.updatedAt,
  };
}
