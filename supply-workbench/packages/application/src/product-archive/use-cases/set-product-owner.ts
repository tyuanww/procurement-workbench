import type { SetProductOwner, SetProductOwnerDeps } from '../boundary.js';
import type { UserRepository } from '../../ports/user-repository.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { NotFoundError } from '../../shared/errors.js';
import { productContactDisplay } from '../workbook/model.js';

export const makeSetProductOwner =
  (deps: SetProductOwnerDeps): SetProductOwner =>
  async (input, actor) => {
    authorize(actor, 'products.maintain');
    const { productId, partCodeRaw, ownerName } = input;
    await deps.uow.run(async (tx) => {
      const product = await tx.products.get(productId);
      const at = deps.clock.now();
      if (partCodeRaw === null) {
        const contacts = (await tx.productContacts.listByProduct(productId)).filter(contact => contact.role === 'product_info');
        const isUnchanged = ownerName === null ? contacts.length === 0 : ownerName === await ownerDisplay(contacts, tx.users);
        if (isUnchanged) return;
        await tx.productContacts.replaceRole({ productId, role: 'product_info', people: ownerName === null ? [] : [{
          productId, role: 'product_info', source: 'workbench', nameRaw: ownerName, userId: null, note: null, updatedBy: actor.id, updatedAt: at,
        }] });
      } else {
        if (!await tx.productOwners.hasPart({ productBarcodeRaw: product.barcodeRaw, partCodeRaw })) throw new NotFoundError('BOM 子件', partCodeRaw);
        await tx.productOwners.set({ productId, partCodeRaw, ownerName });
      }
      await tx.audit.record(auditOf({
        action: 'product.owner',
        subject: { id: productId },
        ctx: { actor, at, entity: '产品负责人', after: { partCodeRaw, ownerName } },
      }));
    });
    return { ownerName };
  };

async function ownerDisplay(contacts: Parameters<typeof productContactDisplay>[0], users: UserRepository): Promise<string | null> {
  const userIds = new Set(contacts.flatMap(({ userId }) => userId === null ? [] : [userId]));
  const linked = await Promise.all([...userIds].map(userId => users.find(userId)));
  return productContactDisplay(contacts, new Map(linked.flatMap(user => user === undefined ? [] : [[user.id, user.name]])));
}
