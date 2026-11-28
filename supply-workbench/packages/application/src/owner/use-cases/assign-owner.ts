import { assignBuyer } from '@sw/domain';
import type { AssignOwner, AssignOwnerDeps } from '../boundary.js';
import { assertCanAssignOwner, applyOwnerAssignment, requireOwnerAccount } from '../../shared/owner-assignment.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { lockOrderLines, requireLockedOrderLine } from '../../shared/locked-order-lines.js';

export const makeAssignOwner =
  (deps: AssignOwnerDeps): AssignOwner =>
  async (input, actor) => {
    authorize(actor, 'lines.write');
    if (input.lineIds.length === 0) throw new ValidationFailedError('没有选中订单行');
    const at = deps.clock.now();
    let updated = 0;
    await deps.uow.run(async (tx) => {
      const user = await requireOwnerAccount(tx.users, input.ownerUserId);
      const lines = await lockOrderLines(tx.orderLines, input.lineIds);
      for (const lineId of input.lineIds) {
        const before = requireLockedOrderLine(lines, lineId);
        assertCanAssignOwner(actor, before);
        const assigned = assignBuyer({ line: before, buyerUserId: user.id, at });
        await tx.orderLines.save(assigned);
        const after = await applyOwnerAssignment({
          tx,
          nextId: () => deps.ids.next(),
          at,
          line: assigned,
          desired: { status: 'assigned', ownerUserId: user.id, ownerNameRaw: user.name, source: 'manual', sourceRef: null },
        });
        lines.set(lineId, after);
        await tx.audit.record(auditOf({ action: 'line.owner.assign', subject: after, ctx: { actor, at, before, after, entity: '订单行' } }));
        updated += 1;
      }
    });
    return { updated };
  };
