import type { BulkCreateItems, BulkCreateItemsDeps } from '../boundary.js';
import type { IdGenerator } from '../../ports/id-generator.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { refreshLineProjection } from '../../shared/line-projection.js';
import { backfillItems, type ItemBackfill } from './backfill.js';
import { itemDraft } from './drafts.js';

export const makeBulkCreateItems =
  (deps: BulkCreateItemsDeps): BulkCreateItems =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    const at = deps.clock.now();
    return deps.uow.run(async (tx) => {
      await tx.itemCodes.lockMany(input.codeIds);
      const items: ItemBackfill[] = [];
      for (const codeId of input.codeIds) {
        const item = await createFor(tx, { ids: deps.ids, codeId, at });
        if (item !== null) items.push(item);
      }
      const lineIds = await backfillItems(tx, { items, at });
      if (lineIds.length > 0) await refreshLineProjection(tx, lineIds);
      const created = items.length;
      await tx.audit.record(auditOf({ action: 'code.bulk-create', subject: { id: actor.id }, ctx: { actor, at, after: { created }, entity: '物料' } }));
      return { created };
    });
  };

async function createFor(tx: UnitOfWorkStores, ctx: { readonly ids: IdGenerator; readonly codeId: string; readonly at: string }): Promise<ItemBackfill | null> {
  const code = await tx.itemCodes.get(ctx.codeId);
  if (code.status === 'rejected' || code.itemId !== null) return null;
  const itemId = ctx.ids.next();
  await tx.items.save(itemDraft({ id: itemId, at: ctx.at, displayName: code.codeRaw, kind: 'unknown' }));
  await tx.itemCodes.save({ ...code, itemId, status: 'approved', updatedAt: ctx.at });
  return { codeNorm: code.codeNorm, itemId };
}
