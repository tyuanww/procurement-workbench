import {
  createBatch,
  generateBatchCandidates,
  type BatchCandidate,
  type DeliveryBatchId,
  type EntityId,
  type FactoryReportRow,
  type OrderLineId,
} from '@sw/domain';
import type { Actor } from '../../shared/actor.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { auditOf } from '../../shared/audit.js';
import { resolveMaterialLine } from './demand-line.js';
import { commandContext, persistBatch } from './persist-batch.js';
import type { BatchDemandSource } from '../../ports/delivery-batch-repository.js';

const NO_SLOT = -1;

export type SlotSkip = {
  readonly rowId: string;
  readonly slotIndex: number;
  readonly reason: string;
};
export type RowOutcome = {
  readonly lines: number;
  readonly batches: number;
  readonly skipped: readonly SlotSkip[];
};

type GenerateInput = {
  readonly tx: UnitOfWorkStores;
  readonly rowId: string;
  readonly actor: Actor;
  readonly at: string;
  readonly nextOrderLineId: () => OrderLineId;
  readonly nextEntityId: () => EntityId;
  readonly nextDeliveryBatchId: () => DeliveryBatchId;
};

export async function generateDemandRow(input: GenerateInput): Promise<RowOutcome> {
  const { row, sources } = await input.tx.factoryReports.getForDemandGeneration(input.rowId);
  const blocked = blockReason(row);
  if (blocked !== null) return skippedRow(row.id, blocked);
  const demand = row.demand;
  if (demand === null) return skippedRow(row.id, '不是需求行');
  const candidates = generateBatchCandidates([
    {
      rowId: row.id,
      blockMaterialPoRaw: demand.blockMaterialPoRaw,
      itemCodeRaw: demand.itemCodeRaw,
      slots: demand.slots,
    },
  ]);
  if (candidates.length === 0) return { lines: 0, batches: 0, skipped: [] };
  const line = await resolveMaterialLine(input.tx, {
    demand,
    factoryPartyId: row.factoryPartyId,
    at: input.at,
    nextOrderLineId: input.nextOrderLineId,
    nextEntityId: input.nextEntityId,
  });
  if ('reason' in line)
    return {
      lines: 0,
      batches: 0,
      skipped: candidates.map((slot) => skip({ rowId: row.id, slotIndex: slot.slotIndex, reason: line.reason })),
    };
  if (line.created) await auditLine(input, line.lineId);
  const made = await createSlots({
    ...input,
    lineId: line.lineId,
    factoryPartyId: row.factoryPartyId,
    candidates,
    sources: row.linkedOrderLineId === null || row.linkedOrderLineId === line.lineId ? sources : new Map(),
  });
  return { lines: line.created ? 1 : 0, batches: made.batches, skipped: made.skipped };
}

function blockReason(row: FactoryReportRow): string | null {
  if (row.kind !== 'demand') return '不是需求行';
  if (row.demand?.role === 'parent') return '不是物料行';
  return null;
}

async function auditLine(input: GenerateInput, lineId: string): Promise<void> {
  const line = await input.tx.orderLines.get(lineId);
  await input.tx.audit.record(
    auditOf({ action: 'line.create', subject: line, ctx: { actor: input.actor, at: input.at, entity: '订单行' } }),
  );
}

async function createSlots(
  input: GenerateInput & {
    readonly lineId: OrderLineId;
    readonly factoryPartyId: EntityId;
    readonly candidates: readonly BatchCandidate[];
    readonly sources: ReadonlyMap<number, BatchDemandSource>;
  },
): Promise<{ readonly batches: number; readonly skipped: SlotSkip[] }> {
  const skipped: SlotSkip[] = [];
  let batches = 0;
  let seq = nextSeq(await input.tx.batches.listByOrderLine(input.lineId));
  const line = await input.tx.orderLines.get(input.lineId);
  const receiver = line.receiverPartyId ?? input.factoryPartyId;
  for (const slot of input.candidates) {
    const outcome = await createSlot({ ...input, slot, seq, receiver, unit: line.unit, skipped,
      generationSource: input.sources.get(slot.slotIndex) ?? null });
    if (outcome === 'skipped') continue;
    seq += 1;
    batches += 1;
  }
  return { batches, skipped };
}

async function createSlot(
  input: GenerateInput & {
    readonly lineId: OrderLineId;
    readonly slot: BatchCandidate;
    readonly seq: number;
    readonly receiver: EntityId;
    readonly unit: string | null;
    readonly skipped: SlotSkip[];
    readonly generationSource: BatchDemandSource | null;
  },
): Promise<'created' | 'skipped'> {
  const prior = await input.tx.batches.listByOriginRef({
    rowId: input.slot.rowId,
    slotIndex: input.slot.slotIndex,
  });
  if (prior.length > 0) {
    input.skipped.push(skip({ rowId: input.slot.rowId, slotIndex: input.slot.slotIndex, reason: '已经生成过批次' }));
    return 'skipped';
  }
  const batchId = input.nextDeliveryBatchId();
  const batch = createBatch(
    {
      orderLineId: input.lineId,
      seq: input.seq,
      plannedQty: input.slot.qty,
      plannedUnit: input.unit,
      receiverPartyId: input.receiver,
      dateFactoryRequired: input.slot.date,
      origin: 'from_factory_demand',
      originRef: { rowId: input.slot.rowId, slotIndex: input.slot.slotIndex },
    },
    commandContext({ actor: input.actor, at: input.at, nextId: batchId }),
  );
  const records = { batch, shipments: [], receipts: [], deliveryNote: null };
  await persistBatch({ tx: input.tx, records, dateChanges: [], generationSource: input.generationSource });
  await input.tx.audit.record(
    auditOf({ action: 'batch.create', subject: batch, ctx: { actor: input.actor, at: input.at, entity: '要货批次' } }),
  );
  return 'created';
}

function skippedRow(rowId: string, reason: string): RowOutcome {
  return { lines: 0, batches: 0, skipped: [skip({ rowId, slotIndex: NO_SLOT, reason })] };
}

function skip({ rowId, slotIndex, reason }: { readonly rowId: string; readonly slotIndex: number; readonly reason: string }): SlotSkip {
  return { rowId, slotIndex, reason };
}

function nextSeq(batches: readonly { readonly seq: number }[]): number {
  let seq = 0;
  for (const batch of batches) if (batch.seq > seq) seq = batch.seq;
  return seq + 1;
}
