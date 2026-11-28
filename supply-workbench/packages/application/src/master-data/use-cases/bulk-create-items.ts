import type { BulkCreateItems, BulkCreateItemsDeps } from '../boundary.js';
import type { IdGenerator } from '../../ports/id-generator.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { refreshLineProjection } from '../../shared/line-projection.js';
import { backfillItem } from './backfill.js';
import { itemDraft } from './drafts.js';

export const makeBulkCreateItems =
  (deps: BulkCreateItemsDeps): BulkCreateItems =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    const at = deps.clock.now();
    let created = 0;
    await deps.uow.run(async (tx) => {
      await tx.itemCodes.lockMany(input.codeIds);
      const lineIds: string[] = [];
      for (const codeId of input.codeIds) {
        const made = await createFor(tx, { ids: deps.ids, codeId, actorId: actor.id, at });
        if (made === null) continue;
        created += 1;
        lineIds.push(...made);
      }
      if (lineIds.length > 0) await refreshLineProjection(tx, lineIds);
      await tx.audit.record(auditOf({ action: 'code.bulk-create', subject: { id: actor.id }, ctx: { actor, at, after: { created }, entity: '物料' } }));
    });
    return { created };
  };

async function createFor(tx: UnitOfWorkStores, ctx: { readonly ids: IdGenerator; readonly codeId: string; readonly actorId: string; readonly at: string }): Promise<readonly string[] | null> {
  const code = await tx.itemCodes.get(ctx.codeId);
  if (code.status === 'rejected' || code.itemId !== null) return null;
  const itemId = ctx.ids.next();
  await tx.items.save(itemDraft({ id: itemId, at: ctx.at, displayName: code.codeRaw, kind: 'unknown' }));
  await tx.itemCodes.save({ ...code, itemId, status: 'approved', updatedAt: ctx.at });
  return backfillItem(tx, { codeNorm: code.codeNorm, itemId, at: ctx.at });
}
