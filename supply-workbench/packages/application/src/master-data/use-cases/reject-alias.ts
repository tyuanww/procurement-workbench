import type { RejectAlias, RejectAliasDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { requireText } from './require-text.js';
import { reviewed } from './reviewed.js';

export const makeRejectAlias =
  (deps: RejectAliasDeps): RejectAlias =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    const reason = requireText(input.reason, '驳回要写原因');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      await tx.procurement?.lockCommit();
      const alias = await tx.aliases.get(input.aliasId);
      const after = { ...reviewed(alias, { actorId: actor.id, at, status: 'rejected' }), partyId: null };
      await tx.aliases.save(after);
      await tx.audit.record(auditOf({ action: 'alias.reject', subject: after, ctx: { actor, at, before: alias, after: { ...after, reason }, entity: '别名' } }));
    });
    return { aliasId: input.aliasId };
  };
