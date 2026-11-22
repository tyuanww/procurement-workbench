import type { UpdateParty, UpdatePartyDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { requireText } from './require-text.js';

export const makeUpdateParty =
  (deps: UpdatePartyDeps): UpdateParty =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const before = await tx.parties.get(input.partyId);
      const after = {
        ...before,
        displayName: input.displayName === undefined ? before.displayName : requireText(input.displayName, '主体要有名字'),
        isSupplier: input.isSupplier ?? before.isSupplier,
        isFactory: input.isFactory ?? before.isFactory,
        note: input.note === undefined ? before.note : input.note,
        updatedAt: at,
      };
      await tx.parties.save(after);
      await tx.audit.record(auditOf({ action: 'party.update', subject: after, ctx: { actor, at, before, after, entity: '主体' } }));
    });
    return { partyId: input.partyId };
  };
