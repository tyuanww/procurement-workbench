import type { CreateParty, CreatePartyDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { partyDraft } from './drafts.js';
import { requireText } from './require-text.js';

export const makeCreateParty =
  (deps: CreatePartyDeps): CreateParty =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    const at = deps.clock.now();
    const party = partyDraft({ id: deps.ids.next(), at, input: { ...input, displayName: requireText(input.displayName, '主体要有名字') } });
    await deps.uow.run(async (tx) => {
      await tx.parties.save(party);
      await tx.audit.record(auditOf({ action: 'party.create', subject: party, ctx: { actor, at, entity: '主体' } }));
    });
    return { partyId: party.id };
  };
