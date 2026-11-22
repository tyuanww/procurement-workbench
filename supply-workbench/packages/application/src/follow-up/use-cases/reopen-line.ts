import { reopenLine } from '@sw/domain';
import type { ReopenLine, ReopenLineDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { refreshLineProjection } from '../../shared/line-projection.js';

export const makeReopenLine =
  (deps: ReopenLineDeps): ReopenLine =>
  async (input, actor) => {
    authorize(actor, 'lines.write');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const before = await tx.orderLines.get(input.lineId);
      const batches = await tx.batches.listByOrderLine(input.lineId);
      const after = reopenLine({ line: before, batches, input: { reason: input.reason, at } });
      await tx.orderLines.save(after);
      await refreshLineProjection(tx, [after.id]);
      await tx.audit.record(auditOf({ action: 'line.reopen', subject: after, ctx: { actor, at, before, after, entity: '订单行' } }));
    });
    return { lineId: input.lineId };
  };
