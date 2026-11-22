import { cancelLine } from '@sw/domain';
import type { CancelLine, CancelLineDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { refreshLineProjection } from '../../shared/line-projection.js';

export const makeCancelLine =
  (deps: CancelLineDeps): CancelLine =>
  async (input, actor) => {
    authorize(actor, 'lines.write');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const before = await tx.orderLines.get(input.lineId);
      const after = cancelLine(before, { reason: input.reason, at });
      await tx.orderLines.save(after);
      await refreshLineProjection(tx, [after.id]);
      await tx.audit.record(auditOf({ action: 'line.cancel', subject: after, ctx: { actor, at, before, after, entity: '订单行' } }));
    });
    return { lineId: input.lineId };
  };
