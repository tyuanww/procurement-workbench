import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import type { SetLineFactoryLink, SetLineFactoryLinkDeps } from '../boundary.js';
import { lineFactoryLinksOf, linkIdOf, linkOf } from '../../shared/factory-link.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';

export const makeSetLineFactoryLink =
  (deps: SetLineFactoryLinkDeps): SetLineFactoryLink =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const line = await tx.orderLines.get(input.orderLineId);
      const links = lineFactoryLinksOf(tx);
      const previous = await links.find(line.id);
      const next = input.factoryPartyId === null
        ? unlinkedLink({ id: previous?.id ?? linkIdOf(line.id), at, orderLineId: line.id, reason: requiredReason(input.reason) })
        : await factoryLink({ tx, id: previous?.id ?? linkIdOf(line.id), at, orderLineId: line.id, partyId: input.factoryPartyId });
      await links.save(next);
      await tx.audit.record(auditOf({ action: 'line.factory-link.set', subject: next, ctx: { actor, at, before: previous ?? null, after: next, entity: '订单行' } }));
    });
    return { orderLineId: input.orderLineId };
  };

async function factoryLink(input: {
  readonly tx: UnitOfWorkStores;
  readonly id: string;
  readonly at: string;
  readonly orderLineId: string;
  readonly partyId: string;
}) {
  const party = await input.tx.parties.get(input.partyId);
  if (!party.isFactory) throw new ValidationFailedError('不是代工厂主体');
  return linkOf({ id: input.id, at: input.at, orderLineId: input.orderLineId, factoryPartyId: party.id, status: 'manual', source: 'manual', confidence: 'manual' });
}

function unlinkedLink(input: { readonly id: string; readonly at: string; readonly orderLineId: string; readonly reason: string }) {
  return linkOf({ id: input.id, at: input.at, orderLineId: input.orderLineId, factoryPartyId: null, status: 'unlinked', source: 'manual', confidence: 'none', reason: input.reason });
}

function requiredReason(reason: string | undefined): string {
  if (reason === undefined || reason.trim() === '') throw new ValidationFailedError('取消工厂关联要写原因');
  return reason.trim();
}
