import { assignBuyer } from '@sw/domain';
import type { AssignLines, AssignLinesDeps } from '../boundary.js';
import { assertCanAssignOwner, recordManualOwner, requireOwnerAccount } from '../../shared/owner-assignment.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { lockOrderLines, requireLockedOrderLine } from '../../shared/locked-order-lines.js';

export const makeAssignLines =
  (deps: AssignLinesDeps): AssignLines =>
  async (input, actor) => {
    authorize(actor, 'lines.write');
    const at = deps.clock.now();
    let updated = 0;
    await deps.uow.run(async (tx) => {
      const owner = input.buyerUserId === null ? null : await requireOwnerAccount(tx.users, input.buyerUserId);
      const lines = await lockOrderLines(tx.orderLines, input.lineIds);
      for (const lineId of input.lineIds) {
        const before = requireLockedOrderLine(lines, lineId);
        assertCanAssignOwner(actor, before);
        const after = assignBuyer({ line: before, buyerUserId: input.buyerUserId, at });
        await tx.orderLines.save(after);
        const withOwner = await recordManualOwner({ tx, at, line: after, owner, nextId: () => deps.ids.next() });
        lines.set(lineId, withOwner);
        await tx.audit.record(auditOf({ action: 'line.assign', subject: withOwner, ctx: { actor, at, before, after: withOwner, entity: '订单行' } }));
        updated += 1;
      }
    });
    return { updated };
  };
