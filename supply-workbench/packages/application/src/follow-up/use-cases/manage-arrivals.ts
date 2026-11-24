import { addReceipt, isNotProvided, normalizeText, normalizeUnit, parsePoCell, voidArrivalReceipt } from '@sw/domain';
import type { ArrivalRepository } from '../../ports/arrival-repository.js';
import type { BatchWithRecords } from '../../ports/delivery-batch-repository.js';
import type { Clock } from '../../ports/clock.js';
import type { IdGenerator } from '../../ports/id-generator.js';
import type { UnitOfWork, UnitOfWorkStores } from '../../ports/unit-of-work.js';
import type { Actor } from '../../shared/actor.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { AppError, ValidationFailedError } from '../../shared/errors.js';
import { refreshLineProjection } from '../../shared/line-projection.js';
import type { AllocateArrival, Arrival, ArrivalAllocation, ArrivalCandidate, ArrivalReference, RegisterArrivalInput, ReviseArrivalInput } from '../arrivals.js';
import { commandContext } from './persist-batch.js';

type Stores = UnitOfWorkStores & { readonly arrivals: ArrivalRepository };
type Write = { readonly uow: UnitOfWork<Stores>; readonly clock: Clock; readonly ids: IdGenerator };
type Action = { readonly actor: Actor; readonly at: string; readonly ids: IdGenerator };

export function makeArrivalCommands(deps: Write) {
  return {
    async register(input: RegisterArrivalInput, actor: Actor) {
      authorize(actor, 'records.write');
      const row = { ...input, id: deps.ids.next(), registeredAt: deps.clock.now(), registeredBy: actor.id, revision: 0, allocation: null };
      if (input.receivedOn > deps.clock.today()) invalid('到仓日期不能晚于业务日期');
      assertReference(input.source);
      if (isNotProvided(input.itemCode) || isNotProvided(input.unit)) invalid('请填写完整商品码和原单位');
      return deps.uow.run(async (tx) => {
        const claimed = await tx.arrivals.claimReference(referenceKey(input.source), row.id);
        if (claimed !== row.id) {
          const current = await tx.arrivals.get(claimed);
          if (sameObservation(current, input)) return current;
          conflict('该来源已登记，请核对原到仓记录');
        }
        if (!(await tx.parties.get(input.warehouseId)).isOwnWarehouse) invalid('请选择我方仓库');
        await tx.arrivals.register(row);
        await tx.audit.record(auditOf({ action: 'arrival.register', subject: row, ctx: { actor, at: row.registeredAt, entity: '到仓凭据' } }));
        return row;
      });
    },
    async revise({ id, input }: { readonly id: string; readonly input: ReviseArrivalInput }, actor: Actor) {
      authorize(actor, 'records.write');
      const action = { actor, at: deps.clock.now(), ids: deps.ids };
      return deps.uow.run((tx) => revise({ tx, id, input, action }));
    },
  };
}

export function makeArrivalQueries(repo: ArrivalRepository) {
  return {
    async list(input: Parameters<ArrivalRepository['list']>[0], actor: Actor) {
      authorize(actor, 'records.write');
      const { items, total } = await repo.list(input);
      return { items, page: { page: input.page, pageSize: input.pageSize, total } };
    },
    async detail(id: string, actor: Actor) {
      authorize(actor, 'records.write');
      const arrival = await repo.get(id);
      return { arrival, candidates: await repo.candidates(arrival) };
    },
  };
}

async function revise({ tx, id, input, action }: {
  readonly tx: Stores;
  readonly id: string;
  readonly input: ReviseArrivalInput;
  readonly action: Action;
}): Promise<Arrival> {
  const before = await tx.arrivals.lock(id);
  const revision = input.expectedRevision + 1;
  const requestKey = commandKey(input);
  if (before.revision !== input.expectedRevision) {
    if (await tx.arrivals.replayKey(id, revision) === requestKey) return before;
    conflict('到仓记录已更新，请重新打开后核对');
  }
  assertRevisionAllowed(before, { input, actor: action.actor });
  if (input.kind === 'allocate') await verifyCount(tx, { arrival: before, input });
  const after = await applyRevision({ tx, before, revision, input, action });
  await releasePreviousCount(tx.arrivals, { before, after });
  await tx.arrivals.revise(after, requestKey);
  const operation = input.kind === 'rollback' ? 'rollback' : before.allocation === null ? 'allocate' : 'correct';
  await tx.audit.record(auditOf({ action: `arrival.${operation}`, subject: after, ctx: { ...action, before, after: { ...after, reason: input.reason }, entity: '到仓凭据' } }));
  return after;
}

async function releasePreviousCount(repo: ArrivalRepository, { before, after }: { readonly before: Arrival; readonly after: Arrival }): Promise<void> {
  if (before.allocation === null) return;
  const oldKey = referenceKey(before.allocation.count.document);
  if (oldKey === referenceKey(before.source)) return;
  if (after.allocation !== null && oldKey === referenceKey(after.allocation.count.document)) return;
  await repo.releaseReference(oldKey, before.id);
}

async function applyRevision({ tx, before, revision, input, action }: {
  readonly tx: Stores;
  readonly before: Arrival;
  readonly revision: number;
  readonly input: ReviseArrivalInput;
  readonly action: Action;
}): Promise<Arrival> {
  const previous = before.allocation?.rows ?? [];
  const allocations = input.kind === 'allocate' ? input.allocations : [];
  const locked = await lockBatches(tx, [...previous, ...allocations].map((row) => row.batchId));
  const targets = await lockLines(tx, locked);
  if (before.allocation !== null && input.reason !== null) {
    voidAllocations({ previous, locked, arrival: before, reason: input.reason, action });
  }
  const candidates = input.kind === 'allocate' ? await tx.arrivals.candidates(before) : [];
  const allocation = input.kind === 'allocate'
    ? { count: input.count, rows: applyAllocations({ arrival: before, revision, input, action, locked, targets, candidates }), by: action.actor.id, at: action.at }
    : null;
  for (const batch of locked.values()) await tx.batches.saveWithRecords(batch);
  await refreshLineProjection(tx, [...targets.keys()]);
  return { ...before, revision, allocation };
}

function assertRevisionAllowed(arrival: Arrival, { input, actor }: { readonly input: ReviseArrivalInput; readonly actor: Actor }): void {
  if (arrival.allocation === null) {
    if (input.kind === 'rollback') conflict('此凭据还没有有效分配');
    return;
  }
  if (arrival.allocation.by !== actor.id) authorize(actor, 'admin');
  if (input.reason === null) invalid('请填写更正或撤销原因');
}

async function verifyCount(tx: Stores, { arrival, input }: { readonly arrival: Arrival; readonly input: AllocateArrival }): Promise<void> {
  const { count, allocations } = input;
  assertReference(count.document);
  const hasEvidence = count.conversionEvidence !== null && !isNotProvided(count.conversionEvidence);
  if (!hasEvidence) {
    if (count.unit !== arrival.unit) invalid('跨单位分配须补充适用本次到仓的换算或点收依据');
    if (count.qty !== arrival.qty) invalid('点收量与到仓原数量不一致，请补充可回查的点收差异依据');
  }
  const total = allocations.reduce((sum, row) => sum + scaledQty(row.qty), BigInt(0));
  if (total !== scaledQty(count.qty)) invalid('各批次分配数量之和须等于仓库点收量');
  if (new Set(allocations.map((row) => row.batchId)).size !== allocations.length) invalid('同一批次只能填一条分配');
  const claimant = await tx.arrivals.claimReference(referenceKey(count.document), arrival.id);
  if (claimant !== arrival.id) conflict('这份仓库点收单已对应另一条到仓记录');
}

type Targets = ReadonlyMap<string, Awaited<ReturnType<ArrivalRepository['lockTargetLine']>>>;

function applyAllocations({ arrival, revision, input, action, locked, targets, candidates }: {
  readonly arrival: Arrival;
  readonly revision: number;
  readonly input: AllocateArrival;
  readonly action: Action;
  readonly locked: Map<string, BatchWithRecords>;
  readonly targets: Targets;
  readonly candidates: readonly ArrivalCandidate[];
}): readonly ArrivalAllocation[] {
  const externalLines = new Map<string, string>();
  return input.allocations.map((row) => {
    const loaded = loadedBatch(locked, row.batchId);
    const { batch } = loaded;
    const poNorm = verifyTarget({ loaded, target: targets.get(batch.orderLineId), arrival, unit: input.count.unit, row, candidates });
    const externalLine = JSON.stringify([poNorm, normalizeText(row.poLine)]);
    const previousLine = externalLines.get(externalLine);
    if (previousLine !== undefined && previousLine !== batch.orderLineId) invalid('一个来源 PO 行不能对应多个工作台订单行');
    externalLines.set(externalLine, batch.orderLineId);
    const receiptId = action.ids.next();
    const { document } = input.count;
    const evidence = `${document.source} ${document.number} / ${document.row}，PO ${row.poNumber} / ${row.poLine}`;
    const next = addReceipt({
      records: loaded,
      input: {
        qty: row.qty, receivedOn: arrival.receivedOn, category: row.category, note: row.evidence,
        fulfillment: { kind: 'received', unit: input.count.unit, evidence, disposition: 'normal' },
        arrival: { arrivalId: arrival.id, revision },
      },
      ctx: commandContext({ ...action, nextId: receiptId }),
    });
    locked.set(batch.id, { ...next, dateChanges: loaded.dateChanges });
    return { ...row, lineId: batch.orderLineId, receiptId };
  });
}

function verifyTarget({ loaded, target, arrival, unit, row, candidates }: {
  readonly loaded: BatchWithRecords;
  readonly target: ReturnType<Targets['get']>;
  readonly arrival: Arrival;
  readonly unit: string;
  readonly row: AllocateArrival['allocations'][number];
  readonly candidates: readonly ArrivalCandidate[];
}): string {
  const { batch } = loaded;
  if (target === undefined) conflict('订单行不存在');
  const { line, po } = target;
  const poNorm = verifyPo(row.poNumber, po.poNorm);
  const code = line.itemCodeRaw?.trim() || (line.lane === 'finished' ? line.barcodeRaw?.trim() : null);
  if (line.cancelledAt !== null || code !== arrival.itemCode) invalid('订单行须有效且完整商品码与到仓记录一致');
  verifyBatch({ batch, arrival, unit });
  assertLineConfirmation(row.targetLineId, { lineId: batch.orderLineId, candidates });
  if (isNotProvided(row.poLine) || isNotProvided(row.evidence)) invalid('请填写逐 PO 行标识和该行归批依据');
  return poNorm;
}

function assertLineConfirmation(confirmed: string | undefined, { lineId, candidates }: { readonly lineId: string; readonly candidates: readonly ArrivalCandidate[] }): void {
  if (confirmed === undefined && candidates.some((candidate) => candidate.lineId === lineId && candidate.needsLineConfirmation)) {
    invalid('同 PO 同商品有多条候选，请回查订单详情并确认所选订单行');
  }
  if (confirmed !== undefined && confirmed !== lineId) invalid('核对的工作台订单行 ID 与所选批次不一致');
}

function verifyPo(input: string, matched: string | null): string {
  const number = parsePoCell(input).value;
  if (number.poNorm === null || number.poNorm !== matched || number.relatedPoRaws.length > 0 || number.extraText !== null) invalid('分配的原 PO 号与工作台订单行不一致');
  return number.poNorm;
}

function verifyBatch({ batch, arrival, unit }: { readonly batch: BatchWithRecords['batch']; readonly arrival: Arrival; readonly unit: string }): void {
  if (batch.receiverPartyId !== arrival.warehouseId) invalid('批次仓库与到仓记录不一致');
  if (batch.dateBuyerConfirmed === null || batch.cancelledAt !== null || batch.closedAt !== null) invalid('请选择已确认且未关闭、未取消的要货批次');
  if (normalizeUnit(batch.plannedUnit) !== unit) invalid('点收单位与要货批次计划单位不一致');
}

function voidAllocations({ previous, locked, arrival, reason, action }: {
  readonly previous: readonly ArrivalAllocation[];
  readonly locked: Map<string, BatchWithRecords>;
  readonly arrival: Arrival;
  readonly reason: string;
  readonly action: Action;
}): void {
  for (const row of previous) {
    const loaded = loadedBatch(locked, row.batchId);
    const next = voidArrivalReceipt(loaded, {
      receiptId: row.receiptId,
      arrival: { arrivalId: arrival.id, revision: arrival.revision },
      reason,
      ctx: commandContext({ ...action, nextId: row.receiptId }),
    });
    locked.set(row.batchId, { ...next, dateChanges: loaded.dateChanges });
  }
}

async function lockLines(tx: Stores, batches: ReadonlyMap<string, BatchWithRecords>): Promise<Targets> {
  const ids = [...new Set([...batches.values()].map(({ batch }) => batch.orderLineId))].sort();
  const targets = new Map<string, Awaited<ReturnType<ArrivalRepository['lockTargetLine']>>>();
  for (const id of ids) targets.set(id, await tx.arrivals.lockTargetLine(id));
  return targets;
}

async function lockBatches(tx: Stores, ids: readonly string[]): Promise<Map<string, BatchWithRecords>> {
  const locked = new Map<string, BatchWithRecords>();
  for (const id of [...new Set(ids)].sort()) locked.set(id, await tx.batches.lockWithRecords(id));
  return locked;
}

function loadedBatch(locked: ReadonlyMap<string, BatchWithRecords>, id: string): BatchWithRecords {
  const batch = locked.get(id);
  if (batch === undefined) conflict('批次不存在');
  return batch;
}

function commandKey(input: ReviseArrivalInput): string {
  if (input.kind === 'rollback') return JSON.stringify([input.kind, input.reason]);
  const { count } = input;
  const rows = input.allocations.map((row) => JSON.stringify([row.batchId, row.poNumber, row.poLine, row.evidence, row.qty, row.category, ...(row.targetLineId === undefined ? [] : [row.targetLineId])])).sort();
  return JSON.stringify([input.kind, input.reason, referenceKey(count.document), count.qty, count.unit, count.conversionEvidence, rows]);
}

function sameObservation(current: Arrival, input: RegisterArrivalInput): boolean {
  return referenceKey(current.source) === referenceKey(input.source)
    && current.warehouseId === input.warehouseId && current.receivedOn === input.receivedOn
    && current.itemCode === input.itemCode && current.qty === input.qty && current.unit === input.unit;
}

function referenceKey(ref: ArrivalReference): string {
  return JSON.stringify([ref.kind, normalizeText(ref.source), normalizeText(ref.number), normalizeText(ref.row)]);
}

function assertReference(ref: ArrivalReference): void {
  if ([ref.source, ref.number, ref.row].some(isNotProvided)) invalid('请填写可回查来源、单号或台账版本和明细行');
}

const QUANTITY_SCALE = 10_000;

function scaledQty(qty: number): bigint {
  return BigInt(Math.round(qty * QUANTITY_SCALE));
}

function invalid(reason: string): never {
  throw new ValidationFailedError(reason, { reason });
}

function conflict(reason: string): never {
  throw new AppError({ code: 'STATE_CONFLICT', message: reason, details: { reason } });
}
