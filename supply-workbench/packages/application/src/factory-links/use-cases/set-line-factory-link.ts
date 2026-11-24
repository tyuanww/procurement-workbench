import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import type { FactoryRef, SetLineFactoryLink, SetLineFactoryLinkDeps } from '../boundary.js';
import { lineFactoryLinksOf, linkIdOf, linkOf } from '../../shared/factory-link.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';

export const makeSetLineFactoryLink =
  (deps: SetLineFactoryLinkDeps): SetLineFactoryLink =>
  async (input, actor) => {
    authorize(actor, 'master.review');
    const at = deps.clock.now();
    return deps.uow.run(async (tx) => {
      const line = await tx.orderLines.get(input.orderLineId);
      const links = lineFactoryLinksOf(tx);
      const previous = await links.find(line.id);
      const factory = input.factoryPartyId === null ? null : await getFactory(tx, input.factoryPartyId);
      const next = linkOf({
        id: previous?.id ?? linkIdOf(line.id), at, orderLineId: line.id, source: 'manual',
        ...(factory === null
          ? { factoryPartyId: null, status: 'unlinked', confidence: 'none', reason: requiredReason(input.reason) }
          : { factoryPartyId: factory.id, status: 'manual', confidence: 'manual' }),
      });
      await links.save(next);
      await tx.audit.record(auditOf({ action: 'line.factory-link.set', subject: next, ctx: { actor, at, before: previous ?? null, after: next, entity: '订单行' } }));
      const { orderLineId, status, source, confidence, reason, linkedAt } = next;
      return { orderLineId, factory, status, source, confidence, reason, linkedAt };
    });
  };

async function getFactory(tx: UnitOfWorkStores, partyId: string): Promise<FactoryRef> {
  const party = await tx.parties.get(partyId);
  if (!party.isFactory) throw new ValidationFailedError('不是代工厂主体');
  return { id: party.id, displayName: party.displayName };
}

function requiredReason(reason: string | undefined): string {
  if (reason === undefined || reason.trim() === '') throw new ValidationFailedError('取消工厂关联要写原因');
  return reason.trim();
}
