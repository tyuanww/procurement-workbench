import { addDays, diffDays, weekStart } from '../dates.js';
import { isOpenBatch } from '../batch/status.js';
import { LOW_SAMPLE_THRESHOLD, STUCK_BUCKET_MAX_DAYS } from '../policies.js';
import { localDate, type LocalDate } from '../values/local-date.js';
import type { EntityId } from '../values/ids.js';
import type { KpiBatch, KpiInput } from '../entities/kpi.js';
import { isInFollowStage } from '../line/stage.js';

export type KpiMeasure = {
  readonly numerator: number;
  readonly denominator: number;
  readonly n: number;
  readonly value: number | null;
  readonly lowSample: boolean;
};

export type BuyerLoad = {
  readonly buyerUserId: EntityId;
  readonly openLines: number;
  readonly openBatches: number;
  readonly overdue: number;
  readonly dueToday: number;
  readonly missingDate: number;
  readonly openExceptions: number;
  readonly followUps: number;
};

export type KpiFollowUp = { readonly buyerUserId: EntityId; readonly on: LocalDate };

const DAYS_PER_WEEK = 7;
const SERIES_LENGTH = 8;

export function dueBatches(input: KpiInput): KpiMeasure {
  return count(input.batches.filter((batch) => inDueSet(batch, input)).length);
}

export function onTimeRate(input: KpiInput): KpiMeasure {
  const concluded = input.batches.filter((batch) => inDueSet(batch, input) && hasConclusion(batch, input.today));
  return rate(concluded.filter(isOnTime).length, concluded.length);
}

export function averageDelay(input: KpiInput): KpiMeasure {
  const late = input.batches.filter((batch) => inDueSet(batch, input) && delayOf(batch) !== null);
  return rate(sumDelays(late), late.length);
}

export function currentlyOverdue(input: KpiInput): KpiMeasure {
  return count(input.batches.filter((batch) => isOpenBatch(batch.status) && isBefore(batch.dateBuyerConfirmed, input.today)).length);
}

export function dateChangeCount(input: KpiInput): KpiMeasure {
  const changes = input.dateChanges.filter((change) => !change.isFirstSet && inInstant(change.changedAt, input));
  return count(changes.length);
}

export function noteReturnDays(input: KpiInput): KpiMeasure {
  const delays = input.batches.flatMap((batch) => noteDelay(batch, input));
  return rate(delays.reduce((sum, days) => sum + days, 0), delays.length);
}

export function openExceptionCount(input: KpiInput): KpiMeasure {
  return count(input.exceptions.filter((item) => item.status === 'open').length);
}

export function unassignedOpenExceptionCount(input: KpiInput): number {
  return input.exceptions.filter((item) => item.status === 'open' && (item.buyerUserId === undefined || item.buyerUserId === null)).length;
}

export function weeklyOnTime(input: KpiInput): readonly { readonly weekStart: LocalDate; readonly rate: KpiMeasure }[] {
  const end = weekStart(input.to);
  return Array.from({ length: SERIES_LENGTH }, (_item, index) => {
    const start = addDays(end, -(SERIES_LENGTH - 1 - index) * DAYS_PER_WEEK);
    const week = { ...input, from: start, to: addDays(start, DAYS_PER_WEEK - 1) };
    return { weekStart: start, rate: onTimeRate(week) };
  });
}

export function stuckDistribution(batches: readonly KpiBatch[], today: LocalDate): Record<string, Record<string, number>> {
  const table: Record<string, Record<string, number>> = {};
  for (const batch of batches) {
    if (!isOpenBatch(batch.status)) continue;
    const day = batch.statusChangedAt.split('T')[0];
    if (day === undefined) continue;
    const bucket = stuckBucket(diffDays(today, localDate(day)));
    const row = table[batch.status] ?? {};
    row[bucket] = bump(row[bucket]);
    table[batch.status] = row;
  }
  return table;
}

export function buyerLoads(input: KpiInput, followUps: readonly KpiFollowUp[] = []): BuyerLoad[] {
  const ids = new Set([
    ...input.batches.flatMap((batch) => (batch.buyerUserId === null ? [] : [batch.buyerUserId])),
    ...input.lines.flatMap((line) => (line.buyerUserId === null ? [] : [line.buyerUserId])),
    ...input.exceptions.flatMap((item) => (item.buyerUserId === undefined || item.buyerUserId === null ? [] : [item.buyerUserId])),
  ]);
  for (const item of followUps) ids.add(item.buyerUserId);
  return [...ids].sort().map((buyerUserId) => loadOf({ buyerUserId, input, followUps }));
}

export const KPI_COPY = {
  basis: '基于工作台登记',
  k1: { name: '应到批次', definition: '非取消批次中，firstConfirmedDate 落在期间内的个数' },
  k2: { name: '准时到货率', definition: '分母：应到批次中已经有结论的。有结论等于已收货、已关闭，或今天晚于首次确认日且仍开放。分子：已收货，且最后一次收货日不晚于首次确认日。已关闭的批次不算准时' },
  k3: { name: '平均延迟天数', definition: '应到且已收货并晚到的批次，最后一次收货日减首次确认日的平均值' },
  k4: { name: '当前逾期', definition: '今天开放、且 dateBuyerConfirmed 早于今天的批次数' },
  k5: { name: '改期次数', definition: '期间内 dateBuyerConfirmed 被改的次数，首次设置不算' },
  k6: { name: '送货单回传天数', definition: '期间内回传的送货单，returnedOn 减该批次第一次发货日的平均值' },
  k7: { name: '开放异常', definition: '期间末仍开放的异常数' },
  k8: { name: '采购负荷', definition: '每个负责人：在跟订单行、开放批次、逾期、今日应到、缺确认日期、开放异常、期间内跟进次数。没有在跟订单行就是 0。未分配异常单列，不复制给负责人' },
  k9: { name: '卡点分布', definition: '开放批次按状态和卡住天数分桶：0–3、4–7、8–14、15 天以上' },
} as const;

function loadOf({ buyerUserId, input, followUps }: { readonly buyerUserId: EntityId; readonly input: KpiInput; readonly followUps: readonly KpiFollowUp[] }): BuyerLoad {
  const own = input.batches.filter((batch) => batch.buyerUserId === buyerUserId);
  const open = own.filter((batch) => isOpenBatch(batch.status));
  return {
    buyerUserId,
    openLines: input.lines.filter((line) => line.buyerUserId === buyerUserId && isInFollowStage(line.stage)).length,
    openBatches: open.length,
    overdue: open.filter((batch) => isBefore(batch.dateBuyerConfirmed, input.today)).length,
    dueToday: open.filter((batch) => batch.dateBuyerConfirmed === input.today).length,
    missingDate: open.filter((batch) => batch.status === 'awaiting_date').length,
    openExceptions: input.exceptions.filter((item) => item.status === 'open' && item.buyerUserId === buyerUserId).length,
    followUps: followUps.filter((item) => item.buyerUserId === buyerUserId && inRange(item.on, input)).length,
  };
}

function bump(current: number | undefined): number {
  return current === undefined ? 1 : current + 1;
}

function inDueSet(batch: KpiBatch, input: KpiInput): boolean {
  if (batch.status === 'cancelled' || batch.firstConfirmedDate === null) return false;
  return inRange(batch.firstConfirmedDate, input);
}

function hasConclusion(batch: KpiBatch, today: LocalDate): boolean {
  if (batch.status === 'received' || batch.status === 'closed') return true;
  return isOpenBatch(batch.status) && isBefore(batch.firstConfirmedDate, today);
}

function isOnTime(batch: KpiBatch): boolean {
  if (batch.status !== 'received' || batch.firstConfirmedDate === null) return false;
  const last = lastReceipt(batch);
  return last !== null && !isBefore(batch.firstConfirmedDate, last);
}

function delayOf(batch: KpiBatch): number | null {
  if (batch.status !== 'received' || batch.firstConfirmedDate === null) return null;
  const last = lastReceipt(batch);
  if (last === null || !isBefore(batch.firstConfirmedDate, last)) return null;
  return diffDays(last, batch.firstConfirmedDate);
}

function noteDelay(batch: KpiBatch, input: KpiInput): number[] {
  if (batch.noteReturnedOn === null || !inRange(batch.noteReturnedOn, input)) return [];
  const first = firstShipment(batch);
  if (first === null) return [];
  return [diffDays(batch.noteReturnedOn, first)];
}

function stuckBucket(days: number): string {
  const [short, medium, long] = STUCK_BUCKET_MAX_DAYS;
  if (days <= short) return '0-3';
  if (days <= medium) return '4-7';
  if (days <= long) return '8-14';
  return '15+';
}

function count(value: number): KpiMeasure {
  return { numerator: value, denominator: value, n: value, value, lowSample: value < LOW_SAMPLE_THRESHOLD };
}

function rate(numerator: number, denominator: number): KpiMeasure {
  return { numerator, denominator, n: denominator, value: denominator === 0 ? null : numerator / denominator, lowSample: denominator < LOW_SAMPLE_THRESHOLD };
}

function sumDelays(batches: readonly KpiBatch[]): number {
  let total = 0;
  for (const batch of batches) {
    const delay = delayOf(batch);
    if (delay !== null) total += delay;
  }
  return total;
}

function lastReceipt(batch: KpiBatch): LocalDate | null {
  return latest(batch.receipts.filter((row) => row.voidedAt === null).map((row) => row.receivedOn));
}

function firstShipment(batch: KpiBatch): LocalDate | null {
  const dates = batch.shipments.filter((row) => row.voidedAt === null).map((row) => row.shippedOn);
  return dates.reduce<LocalDate | null>((current, date) => (current === null || isBefore(date, current) ? date : current), null);
}

function latest(dates: readonly LocalDate[]): LocalDate | null {
  return dates.reduce<LocalDate | null>((current, date) => (current === null || isBefore(current, date) ? date : current), null);
}

function isBefore(left: LocalDate | null, right: LocalDate | null): boolean {
  if (left === null || right === null) return false;
  return diffDays(right, left) > 0;
}

function inRange(date: LocalDate, input: KpiInput): boolean {
  return !isBefore(date, input.from) && !isBefore(input.to, date);
}

function inInstant(at: string, input: KpiInput): boolean {
  const day = at.split('T')[0];
  if (day === undefined) return false;
  return inRange(localDate(day), input);
}
