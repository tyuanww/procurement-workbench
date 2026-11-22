import { confirmNameMerge, type EntityId } from '@sw/domain';
import type { ApproveAlias, ApproveAliasDeps } from '../boundary.js';
import type { ApproveAliasInput } from '../views.js';
import type { IdGenerator } from '../../ports/id-generator.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { refreshLineProjection } from '../../shared/line-projection.js';
import { backfillSupplier } from './backfill.js';
import { partyDraft } from './drafts.js';
import { reviewed } from './reviewed.js';

export const makeApproveAlias =
  (deps: ApproveAliasDeps): ApproveAlias =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      await tx.procurement?.lockCommit();
      const alias = await tx.aliases.get(input.aliasId);
      const partyId = await partyFor(tx, { ids: deps.ids, input, at });
      const party = await tx.parties.get(partyId);
      confirmNameMerge({ left: alias.rawName, right: party.displayName, confirmed: input.confirmForbiddenPair === true });
      await tx.aliases.save({ ...reviewed(alias, { actorId: actor.id, at, status: 'approved' }), partyId });
      const lineIds = await backfillSupplier(tx, { normName: alias.normName, partyId, at });
      if (lineIds.length > 0) await refreshLineProjection(tx, lineIds);
      await tx.audit.record(auditOf({ action: 'alias.approve', subject: alias, ctx: { actor, at, before: alias, entity: '别名' } }));
    });
    return { aliasId: input.aliasId };
  };

async function partyFor(tx: UnitOfWorkStores, ctx: { readonly ids: IdGenerator; readonly input: ApproveAliasInput; readonly at: string }): Promise<EntityId> {
  if (ctx.input.createParty !== undefined) return saveParty(tx, { ids: ctx.ids, input: ctx.input.createParty, at: ctx.at });
  if (ctx.input.partyId === undefined) throw new ValidationFailedError('要指定主体或新建主体');
  return ctx.input.partyId;
}

async function saveParty(tx: UnitOfWorkStores, ctx: { readonly ids: IdGenerator; readonly input: NonNullable<ApproveAliasInput['createParty']>; readonly at: string }): Promise<EntityId> {
  const id = ctx.ids.next();
  await tx.parties.save(partyDraft({ id, at: ctx.at, input: ctx.input }));
  return id;
}
