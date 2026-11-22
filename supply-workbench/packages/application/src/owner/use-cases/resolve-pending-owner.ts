import { normalizeText } from '@sw/domain';
import type { ResolvePendingOwner, ResolvePendingOwnerDeps } from '../boundary.js';
import { applyOwnerAssignment, assertCanAssignOwner, ownerAssignmentsOf, requireOwnerAccount } from '../../shared/owner-assignment.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { NotFoundError } from '../../shared/errors.js';

export const makeResolvePendingOwner =
  (deps: ResolvePendingOwnerDeps): ResolvePendingOwner =>
  async (input, actor) => {
    authorize(actor, 'lines.write');
    const at = deps.clock.now();
    const normName = normalizeText(input.ownerNameRaw);
    if (normName === '') throw new NotFoundError('待审核负责人', input.ownerNameRaw);
    let updated = 0;
    await deps.uow.run(async (tx) => {
      const user = await requireOwnerAccount(tx.users, input.ownerUserId);
      const pending = (await ownerAssignmentsOf(tx).listPending()).filter((item) => normalizeText(item.ownerNameRaw ?? '') === normName);
      if (pending.length === 0) throw new NotFoundError('待审核负责人', input.ownerNameRaw);
      for (const item of pending) {
        const before = await tx.orderLines.get(item.subjectId);
        assertCanAssignOwner(actor, before);
        const after = await applyOwnerAssignment({
          tx,
          nextId: () => deps.ids.next(),
          at,
          line: before,
          desired: { status: 'assigned', ownerUserId: user.id, ownerNameRaw: user.name, source: 'mapping_import', sourceRef: null },
        });
        await tx.audit.record(auditOf({ action: 'line.owner.resolve-pending', subject: after, ctx: { actor, at, before, after, entity: '订单行' } }));
        updated += 1;
      }
    });
    return { updated };
  };
