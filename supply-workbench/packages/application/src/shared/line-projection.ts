import { projectLine } from '@sw/domain';
import { StateConflictError } from './errors.js';
import type { UnitOfWorkStores } from '../ports/unit-of-work.js';

export async function refreshLineProjection(tx: UnitOfWorkStores, lineIds: readonly string[]): Promise<void> {
  for (const lineId of lineIds) {
    const line = await tx.orderLines.get(lineId);
    const batches = await tx.batches.listByOrderLine(lineId);
    const projection = projectLine(line, batches);
    if (isSameProjection(line, projection)) continue;
    const next = { ...line, ...projection };
    if (tx.orderLines.saveConditional !== undefined) {
      const isSaved = await tx.orderLines.saveConditional(next, line.updatedAt);
      if (!isSaved) throw new StateConflictError('order_line.updated_at');
    } else {
      await tx.orderLines.save(next);
    }
  }
}

function isSameProjection(line: { readonly stage: string; readonly stageChangedAt: string; readonly nextDueBatchId: string | null; readonly nextDueDate: string | null }, projection: { readonly stage: string; readonly stageChangedAt: string; readonly nextDueBatchId: string | null; readonly nextDueDate: string | null }): boolean {
  return line.stage === projection.stage
    && line.stageChangedAt === projection.stageChangedAt
    && line.nextDueBatchId === projection.nextDueBatchId
    && line.nextDueDate === projection.nextDueDate;
}
