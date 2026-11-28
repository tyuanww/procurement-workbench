import type { GenerateBatchesFromDemand, GenerateBatchesFromDemandDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';
import { freezeGenerationEvidence, generateDemandRow, type RowOutcome, type SlotSkip } from './demand-batches.js';

export const makeGenerateBatchesFromDemand =
  (deps: GenerateBatchesFromDemandDeps): GenerateBatchesFromDemand =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    const skipped: SlotSkip[] = [];
    let createdLines = 0;
    let createdBatches = 0;
    await deps.uow.run(async (tx) => {
      const evidence: NonNullable<RowOutcome['evidence']>[] = [];
      for (const rowId of input.rowIds) {
        const outcome = await generateDemandRow({
          tx,
          rowId,
          actor,
          at,
          nextOrderLineId: () => deps.ids.orderLine(),
          nextEntityId: () => deps.ids.next(),
          nextDeliveryBatchId: () => deps.ids.deliveryBatch(),
        });
        createdLines += outcome.lines;
        createdBatches += outcome.batches;
        skipped.push(...outcome.skipped);
        if (outcome.evidence !== undefined) evidence.push(outcome.evidence);
      }
      // 所有订单写入完成后再取工厂行锁，避免与主数据回填后重联的顺序相反。
      for (const source of evidence) await freezeGenerationEvidence(tx, source);
    });
    return { createdLines, createdBatches, skipped };
  };
