import { entityId } from '@sw/domain';
import type { BackfillSupplierParties, BackfillSupplierPartiesDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';

/** 已审批别名回填采购单供应商主体。幂等：只补 supplierPartyId 为空的采购单。 */
export const makeBackfillSupplierParties =
  (deps: BackfillSupplierPartiesDeps): BackfillSupplierParties =>
  async (_input, actor) => {
    authorize(actor, 'master.review');
    const at = deps.clock.now();
    const aliases = await deps.links.listApprovedSupplierAliases();
    let updated = 0;
    await deps.uow.run(async (tx) => {
      for (const alias of aliases) {
        const orders = await tx.purchaseOrders.backfillMissingSupplier({ normName: alias.normName, partyId: entityId(alias.partyId), at });
        updated += orders.length;
      }
    });
    return { updated };
  };
