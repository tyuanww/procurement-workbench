import type { GenerateBatchesFromDemand, GenerateBatchesFromDemandDeps } from '../boundary.js';
import { purchaseOrderKey } from './purchase-order-ref.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { authorize } from '../../shared/authorize.js';
import { freezeGenerationEvidence, generateDemandRows, type RowOutcome, type SlotSkip } from './demand-batches.js';

export const makeGenerateBatchesFromDemand =
  (deps: GenerateBatchesFromDemandDeps): GenerateBatchesFromDemand =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    const skipped: SlotSkip[] = [];
    let createdLines = 0;
    let createdBatches = 0;
    await deps.uow.run(async (tx) => {
      const demands = await lockedDemands(tx, input.rowIds);
      const outcomes = await generateDemandRows({
        tx, actor, at,
        nextOrderLineId: () => deps.ids.orderLine(),
        nextEntityId: () => deps.ids.next(),
        nextDeliveryBatchId: () => deps.ids.deliveryBatch(),
      }, demands);
      const evidence: NonNullable<RowOutcome['evidence']>[] = [];
      for (const outcome of outcomes) {
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

async function lockedDemands(tx: UnitOfWorkStores, rowIds: readonly string[]) {
  await tx.batches.lockDemandGeneration({ rowIds });
  const demands = [];
  const materialOrderNumbers = new Set<string | null>();
  for (const rowId of rowIds) {
    const source = await tx.factoryReports.getForDemandGeneration(rowId);
    demands.push(source);
    if (source.row.demand?.role === 'material') {
      materialOrderNumbers.add(purchaseOrderKey(source.row.demand.blockMaterialPoRaw).poNorm);
    }
  }
  await tx.batches.lockDemandGeneration({ materialOrderNumbers: [...materialOrderNumbers] });
  return demands;
}
