import { validateContacts, type EntityId, type ProductContact } from '@sw/domain';
import type { SetProductContacts, SetProductContactsDeps } from '../boundary.js';
import type { SetProductContactsInput } from '../views.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';

export const makeSetProductContacts =
  (deps: SetProductContactsDeps): SetProductContacts =>
  async (input, actor) => {
    authorize(actor, 'products.maintain');
    const at = deps.clock.now();
    const people = peopleOf(input, { actorId: actor.id, at });
    await deps.uow.run(async (tx) => {
      await tx.products.get(input.productId);
      await tx.productContacts.replaceRole({ productId: input.productId, role: input.role, people });
      await tx.audit.record(auditOf({ action: 'product.contacts', subject: { id: input.productId }, ctx: { actor, at, after: { role: input.role, people }, entity: '产品联系人' } }));
    });
    return { productId: input.productId };
  };

function peopleOf(input: SetProductContactsInput, stamp: { readonly actorId: EntityId; readonly at: string }): ProductContact[] {
  return input.people.map((person) => contactOf({ input, person, stamp }));
}

function contactOf({ input, person, stamp }: { readonly input: SetProductContactsInput; readonly person: SetProductContactsInput['people'][number]; readonly stamp: { readonly actorId: EntityId; readonly at: string } }): ProductContact {
  const userId = person.userId ?? null;
  const nameRaw = person.nameRaw ?? null;
  if (!validateContacts({ userId, nameRaw })) throw new ValidationFailedError('联系人要填用户或名字');
  return { productId: input.productId, role: input.role, userId, nameRaw, note: person.note ?? null, source: 'workbench', updatedBy: stamp.actorId, updatedAt: stamp.at };
}
