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
  readonly evidence?: GenerationEvidence;
};

type CreatedSlot = { readonly batchId: DeliveryBatchId; readonly slotIndex: number };
type GenerationEvidence = {
  readonly rowId: string;
  readonly version: string;
  readonly orderLineId: OrderLineId;
  readonly created: readonly CreatedSlot[];
};

type GenerateInput = {
  readonly tx: UnitOfWorkStores;
  readonly actor: Actor;
  readonly at: string;
  readonly nextOrderLineId: () => OrderLineId;
  readonly nextEntityId: () => EntityId;
  readonly nextDeliveryBatchId: () => DeliveryBatchId;
};

type DemandSnapshot = Awaited<ReturnType<UnitOfWorkStores['factoryReports']['getForDemandGeneration']>>;

export async function generateDemandRow(input: GenerateInput, { row, version }: DemandSnapshot): Promise<RowOutcome> {
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
  });
  const evidence = version === null || made.created.length === 0 ? undefined : {
    rowId: row.id, version, orderLineId: line.lineId, created: made.created,
  };
  return { lines: line.created ? 1 : 0, batches: made.created.length, skipped: made.skipped, ...(evidence === undefined ? {} : { evidence }) };
}

export async function freezeGenerationEvidence(tx: UnitOfWorkStores, { created, ...ref }: GenerationEvidence): Promise<void> {
  const sources = await tx.factoryReports.demandSourcesAtGeneration(ref);
  for (const { batchId, slotIndex } of created) {
    const source = sources.get(slotIndex);
    if (source !== undefined) await tx.batches.freezeDemandSource({ batchId, rowId: ref.rowId, source });
  }
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
  },
): Promise<{ readonly created: CreatedSlot[]; readonly skipped: SlotSkip[] }> {
  const skipped: SlotSkip[] = [];
  const created: CreatedSlot[] = [];
  const line = await input.tx.orderLines.lock(input.lineId);
  let seq = nextSeq(await input.tx.batches.listByOrderLine(input.lineId));
  const receiver = line.receiverPartyId ?? input.factoryPartyId;
  for (const slot of input.candidates) {
    const batchId = await createSlot({ ...input, slot, seq, receiver, unit: line.unit, skipped });
    if (batchId === undefined) continue;
    seq += 1;
    created.push({ batchId, slotIndex: slot.slotIndex });
  }
  return { created, skipped };
}

async function createSlot(
  input: GenerateInput & {
    readonly lineId: OrderLineId;
    readonly slot: BatchCandidate;
    readonly seq: number;
    readonly receiver: EntityId;
    readonly unit: string | null;
    readonly skipped: SlotSkip[];
  },
): Promise<DeliveryBatchId | undefined> {
  const prior = await input.tx.batches.listByOriginRef({
    rowId: input.slot.rowId,
    slotIndex: input.slot.slotIndex,
  });
  if (prior.length > 0) {
    input.skipped.push(skip({ rowId: input.slot.rowId, slotIndex: input.slot.slotIndex, reason: '已经生成过批次' }));
    return undefined;
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
  await persistBatch({ tx: input.tx, records, dateChanges: [] });
  await input.tx.audit.record(
    auditOf({ action: 'batch.create', subject: batch, ctx: { actor: input.actor, at: input.at, entity: '要货批次' } }),
  );
  return batchId;
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
