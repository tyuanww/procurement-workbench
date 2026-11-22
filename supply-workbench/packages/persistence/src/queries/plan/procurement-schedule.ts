import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { inclusiveScheduleDays, PROCUREMENT_SCHEDULE_STAGES, procurementStageId, parseLocalDate, localDate } from '@sw/domain';
import type { ProcurementDateField, ProcurementDateObservation, ProcurementScheduleDates, ProcurementScheduleItem, ProcurementScheduleQuery } from '@sw/application';
import { NotFoundError } from '@sw/application/errors';
import type { AppDatabase } from '../../client.js';
import { entityId } from '../../mappers/id.js';
import { instant } from '../../mappers/time.js';
import { importBatches, importRows, orderLines, users, workItemEvents, workItems } from '../../schema/index.js';
import { isAppliedImportBatch } from '../imports/applied-source.js';
import { storeFilter } from '../store-progress/scope.js';
import { isRecord, oneOf } from '../follow-up/guards.js';
import { WORK_ITEM_STATUSES } from '../../../../domain/src/entities/work-items.js';

const masterFields = [
  ['submittedOn', 'oaSubmittedOn'],
  ['masterTargetOn', 'oaRequiredOn'],
  ['semiFinishedOrderedOn', 'actualStartOn'],
] as const;

export async function scopedProcurementDates(db: AppDatabase, { orderLineId, store }: ProcurementScheduleQuery) {
  const line = (await db.select({ buyerUserId: orderLines.buyerUserId }).from(orderLines).where(and(
    eq(orderLines.id, orderLineId), eq(orderLines.lane, 'finished'),
    storeFilter({ store, line: orderLines.id, hasMaterialScope: false }),
  )))[0];
  if (line === undefined) throw new NotFoundError('成品订单行', orderLineId);
  return { dates: await procurementScheduleDates(db, orderLineId), buyerUserId: line.buyerUserId };
}

export async function procurementScheduleDates(db: AppDatabase, orderLineId: string): Promise<ProcurementScheduleDates> {
  const rows = await db.select({
    importBatchId: importBatches.id, sheetName: importRows.sheetName, rowNo: importRows.rowNo, parsed: importRows.parsed,
    committedAt: importBatches.committedAt, committedBy: importBatches.committedBy,
  }).from(importRows).innerJoin(importBatches, eq(importBatches.id, importRows.importBatchId))
    .where(and(eq(importRows.targetId, orderLineId), notInArray(importRows.action, ['skip', 'conflict']), eq(importBatches.template, 'po-master-v1'), isAppliedImportBatch()))
    .orderBy(asc(importBatches.committedAt), asc(importBatches.id), asc(importRows.sheetName), asc(importRows.rowNo));
  const observations = rows.flatMap(observationsOf);
  const targetBatches = new Set(observations.map((item) => item.importBatchId));
  const originalTargetOn = firstTarget(observations, targetBatches);
  const submittedOn = latestDate(observations, 'submittedOn');
  const releasedOn = latestDate(observations, 'releasedOn');
  return {
    submittedOn, releasedOn, originalTargetOn, observations,
    projectOrderedOn: latestDate(observations, 'projectOrderedOn'),
    semiFinishedOrderedOn: latestDate(observations, 'semiFinishedOrderedOn'),
    submissionDays: inclusiveScheduleDays(submittedOn, originalTargetOn),
    releaseDays: inclusiveScheduleDays(releasedOn, originalTargetOn),
  };
}

function firstTarget(observations: readonly ProcurementDateObservation[], batches: ReadonlySet<string>) {
  const targets = new Map<string, ProcurementDateObservation[]>();
  for (const item of observations) {
    if (item.field !== 'masterTargetOn' && item.field !== 'projectTargetOn') continue;
    const fromBatch = targets.get(item.importBatchId) ?? [];
    fromBatch.push(item);
    targets.set(item.importBatchId, fromBatch);
  }
  for (const id of batches) {
    const target = targets.get(id);
    if (target === undefined) continue;
    const master = distinctDate(target, 'masterTargetOn');
    if (master !== null) return master;
    if (target.some((item) => item.field === 'masterTargetOn')) continue;
    const project = distinctDate(target, 'projectTargetOn');
    if (project !== null) return project;
  }
  return null;
}

function latestDate(items: readonly ProcurementDateObservation[], field: ProcurementDateField) {
  const matching = items.filter((item) => item.field === field);
  const batchId = matching.at(-1)?.importBatchId;
  return distinctDate(matching.filter((item) => item.importBatchId === batchId), field);
}

function distinctDate(items: readonly ProcurementDateObservation[], field: ProcurementDateField) {
  const dates = new Set(items.filter((item) => item.field === field).map((item) => item.value));
  return dates.size === 1 ? [...dates][0] ?? null : null;
}

type SourceRow = {
  readonly importBatchId: string;
  readonly sheetName: string;
  readonly rowNo: number;
  readonly parsed: unknown;
  readonly committedAt: string | null;
  readonly committedBy: string | null;
};

function observationsOf(row: SourceRow): ProcurementDateObservation[] {
  if (!isRecord(row.parsed) || row.committedAt === null) return [];
  const { parsed, importBatchId, committedBy } = row;
  const revision = { importBatchId, committedBy, committedAt: instant(row.committedAt) };
  const masterSource = { sheetName: row.sheetName, rowNo: row.rowNo };
  const master = masterFields.flatMap(([field, key]) => {
    const cell = parsed[key];
    return isRecord(cell) && typeof cell.raw === 'string' ? [{ ...revision, field, raw: cell.raw, value: dateOf(cell.value), source: masterSource }] : [];
  });
  const projects = Array.isArray(parsed.projectDates) ? parsed.projectDates.flatMap(projectObservation) : [];
  return [...master, ...projects.map((project) => ({ ...revision, ...project }))];
}

function projectObservation(cell: unknown): Pick<ProcurementDateObservation, 'field' | 'raw' | 'value' | 'source'>[] {
  if (!isRecord(cell) || typeof cell.raw !== 'string' || !isRecord(cell.source)) return [];
  const { field, raw, value } = cell;
  if (field !== 'releasedOn' && field !== 'projectOrderedOn' && field !== 'projectTargetOn') return [];
  const { sheetName, rowNo, column, range } = cell.source;
  if (typeof sheetName !== 'string' || typeof rowNo !== 'number' || typeof column !== 'number') return [];
  return [{ field, raw, value: dateOf(value), source: { sheetName, rowNo, column, range: rangeOf(range) } }];
}

function rangeOf(range: unknown) {
  if (!isRecord(range)) return null;
  const { startRow, endRow, startColumn, endColumn } = range;
  if (typeof startRow !== 'number' || typeof endRow !== 'number' || typeof startColumn !== 'number' || typeof endColumn !== 'number') return null;
  return { startRow, endRow, startColumn, endColumn };
}

function dateOf(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = parseLocalDate(value);
  return date.ok ? date.value : null;
}

export async function procurementScheduleItems(db: AppDatabase, orderLineId: string): Promise<readonly ProcurementScheduleItem[]> {
  const stages = PROCUREMENT_SCHEDULE_STAGES.map((stage) => ({ stage, id: procurementStageId(orderLineId, stage) }));
  const rows = await db.select({
    id: workItems.id, plannedStart: workItems.plannedStart, plannedEnd: workItems.plannedEnd, status: workItems.status,
    version: workItems.version, ownerName: users.name, source: workItemEvents.newValue,
  }).from(workItems).leftJoin(users, eq(users.id, workItems.ownerUserId))
    .leftJoin(workItemEvents, and(eq(workItemEvents.workItemId, workItems.id), eq(workItemEvents.kind, 'created')))
    .where(inArray(workItems.id, stages.map((stage) => stage.id)));
  return stages.flatMap(({ id, stage }) => {
    const row = rows.find((item) => item.id === id);
    if (row === undefined) return [];
    return [{
      stage, id: entityId(row.id), plannedStart: localDate(row.plannedStart), plannedEnd: localDate(row.plannedEnd),
      status: oneOf(WORK_ITEM_STATUSES, row.status), version: row.version, ownerName: row.ownerName, basis: basisOf(row.source),
    }];
  });
}

function basisOf(snapshot: unknown) {
  if (!isRecord(snapshot) || !isRecord(snapshot.procurementCycle)) return null;
  const { materialsDays, productionDays, deliveryDays, basis } = snapshot.procurementCycle;
  if (typeof materialsDays !== 'number' || typeof productionDays !== 'number' || typeof deliveryDays !== 'number' || typeof basis !== 'string') return null;
  return { materialsDays, productionDays, deliveryDays, basis };
}
