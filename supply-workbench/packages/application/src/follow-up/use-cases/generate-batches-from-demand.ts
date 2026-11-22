import type { GenerateBatchesFromDemand, GenerateBatchesFromDemandDeps } from '../boundary.js';
import { authorize } from '../../shared/authorize.js';
import { generateDemandRow, type SlotSkip } from './demand-batches.js';

export const makeGenerateBatchesFromDemand =
  (deps: GenerateBatchesFromDemandDeps): GenerateBatchesFromDemand =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    const skipped: SlotSkip[] = [];
    let createdLines = 0;
    let createdBatches = 0;
    await deps.uow.run(async (tx) => {
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
      }
    });
    return { createdLines, createdBatches, skipped };
  };
