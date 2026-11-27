import type { DeliveryScheduleBatch, DeliveryScheduleTask, OrderLineRow, WorkItemPredecessor } from '@sw/contracts';
import { addDays, diffDays, isOpenBatch, weekStart, type LocalDate } from '@sw/domain';
import { scheduleIntervalGeometry, type ScheduleFilters, type ScheduleOptions, type ScheduleWindow, type TimelineBar } from '../../features/progress/index.js';
import { shortDate, type WorkItem } from '../../features/today/index.js';
import { matchesDeliveryParties, scheduledPlanningBatch, type OrderPlanningBatch, type WeeklyOrderAction, type WeeklyOrderDelivery } from './planning-batches.js';
import { dateInWindow, planningBatchStatus, planningOrderFields, type PlanningGroup, type PlanningPoint, type PlanningRow } from './planning-rows.js';

type WeeklyInput = {
  readonly batches: readonly DeliveryScheduleBatch[];
  readonly deliveryTasks?: readonly DeliveryScheduleTask[];
  readonly items: readonly WorkItem[];
  readonly conflicts: Readonly<Record<string, readonly WorkItemPredecessor[]>>;
  readonly orders: readonly OrderLineRow[];
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly filters: ScheduleFilters;
  readonly keyword: string;
  readonly bucket?: WeeklyDeliveryBucket | null;
};

export type BatchDependencies = ReadonlyMap<string, readonly DeliveryScheduleTask[]>;
export type WeeklyDeliveryBucket = 'expected' | 'outstanding' | 'nextRisk';
type DeliveryFact = {
  readonly batch: DeliveryScheduleBatch;
  readonly tasks: readonly DeliveryScheduleTask[];
  readonly source: OrderPlanningBatch & { readonly weeklyDelivery: WeeklyOrderDelivery };
  readonly expected: boolean;
  readonly outstanding: boolean;
  readonly overdue: { readonly start: LocalDate; readonly days: number; readonly isCarried: boolean } | null;
  readonly nextRisk: { readonly date: LocalDate; readonly reasons: readonly string[] } | null;
};

const NEXT_WEEK_DAYS = 7;

export function weeklyDelivery(input: WeeklyInput) {
  const { deliveries, dependencies } = deliveryFacts(input);
  const expected = deliveries.filter((entry) => entry.expected);
  const outstanding = deliveries.filter((entry) => entry.outstanding);
  const nextRisk = deliveries.filter((entry) => entry.nextRisk !== null);
  const other = deliveries.filter((entry) => !entry.outstanding && entry.nextRisk === null &&
    (entry.expected || entry.batch.receiptDates.some((date) => dateInWindow(date, input.window))));
  const isCurrentWeek = input.window.from === weekStart(input.today);
  const week = isCurrentWeek ? '本周' : '当周';
  const titles: Readonly<Record<WeeklyDeliveryBucket, string>> = { expected: `${week}应到`, outstanding: `${week}仍未到`, nextRisk: '下周有风险' };
  const buckets = { expected, outstanding, nextRisk };
  const groups = input.bucket == null ? [
    bucketGroup({ key: 'outstanding', title: titles.outstanding, deliveries: outstanding }, input),
    bucketGroup({ key: 'other', title: `${week}其他应到与实收`, deliveries: other }, input),
    bucketGroup({ key: 'nextRisk', title: titles.nextRisk, deliveries: nextRisk }, input),
  ] : [bucketGroup({ key: input.bucket, title: titles[input.bucket], deliveries: buckets[input.bucket] }, input)];
  return {
    groups: groups.filter((group) => group.rows.length > 0), titles, batchDependencies: dependencies,
    batchActions: new Map(deliveries.map(({ batch, source }) => [batch.id, source.weeklyDelivery])),
    counts: { expected: expected.length, outstanding: outstanding.length, nextRisk: nextRisk.length },
  };
}

function deliveryFacts({ batches, deliveryTasks, items, conflicts, orders, window, today, filters, keyword }: WeeklyInput) {
  const dependencies = tasksByBatch(deliveryTasks ?? items.map((task) => ({ task, dependencies: conflicts[task.id] ?? [], conflicts: conflicts[task.id] ?? [] })));
  const byLine = new Map(orders.map((order) => [order.id, order]));
  const needle = keyword.trim().toLocaleLowerCase();
  const next = { from: addDays(window.to, 1), to: addDays(window.to, NEXT_WEEK_DAYS) };
  const deliveries = batches.flatMap((batch): DeliveryFact[] => {
    const tasks = dependencies.get(batch.id) ?? [];
    const candidate = { batch, tasks };
    if (batch.status === 'cancelled' || !matchesFilters(candidate, filters) || !matchesKeyword(candidate, { order: byLine.get(batch.orderLineId), needle })) return [];
    return [deliveryFact(candidate, { window, today, next })];
  });
  return { deliveries, dependencies };
}

type DeliveryCandidate = Pick<DeliveryFact, 'batch' | 'tasks'>;

function deliveryFact({ batch, tasks }: DeliveryCandidate, { window, today, next }:
  Pick<WeeklyInput, 'window' | 'today'> & { readonly next: ScheduleWindow }): DeliveryFact {
  const { confirmed } = batch;
  const isOpen = hasOutstandingDelivery(batch);
  const isExpected = confirmed !== null && dateInWindow(confirmed, window);
  const overdue = isOpen ? overdueDelivery(confirmed, { window, today }) : null;
  const source = scheduledPlanningBatch(batch);
  const nextRisk = isOpen ? nextWeekRisk({ batch, tasks }, next) : null;
  const weeklyDelivery = orderDeliveryActions({
    facts: source.facts, today, isOpen, hasRisk: nextRisk !== null, reviewCount: batch.fulfillment.reviewCount, supplier: batch.supplier,
  });
  return { batch, tasks, source: { ...source, weeklyDelivery }, expected: isExpected,
    outstanding: isOpen && (isExpected || overdue?.isCarried === true), overdue, nextRisk };
}

export function orderDeliveryActions({ facts, today, isOpen, hasRisk, reviewCount, supplier }: {
  readonly facts: OrderPlanningBatch['facts']; readonly today: LocalDate; readonly isOpen: boolean;
  readonly hasRisk: boolean; readonly reviewCount: number; readonly supplier: WeeklyOrderDelivery['supplier'];
}): WeeklyOrderDelivery {
  const { confirmed, outstandingQty } = facts;
  const timing = weeklyTiming({ isOpen, confirmed, today, outstandingQty });
  return { supplier, timing, actions: weeklyActions({ facts, timing, hasRisk, reviewCount }) };
}

function weeklyTiming({ isOpen, confirmed, today, outstandingQty }: {
  readonly isOpen: boolean; readonly confirmed: LocalDate | null; readonly today: LocalDate; readonly outstandingQty: number | null;
}): WeeklyOrderDelivery['timing'] {
  if (!isOpen) return 'settled';
  if (confirmed === null) return 'needs-review';
  if (confirmed > today) return 'upcoming';
  if (confirmed === today) return 'due-today';
  return outstandingQty === null ? 'needs-review' : 'overdue';
}

function weeklyActions({ facts, timing, hasRisk, reviewCount }: {
  readonly facts: OrderPlanningBatch['facts']; readonly timing: WeeklyOrderDelivery['timing'];
  readonly hasRisk: boolean; readonly reviewCount: number;
}): readonly WeeklyOrderAction[] {
  if (timing === 'settled') return [];
  return [weeklyDateAction({ facts, timing, hasRisk }), weeklyReceiptAction(facts, reviewCount)].filter((action) => action !== null);
}

function weeklyDateAction({ facts: { confirmed, conflict, unshippedQty, unit }, timing, hasRisk }: {
  readonly facts: OrderPlanningBatch['facts']; readonly timing: Exclude<WeeklyOrderDelivery['timing'], 'settled'>; readonly hasRisk: boolean;
}): WeeklyOrderAction | null {
  if (confirmed === null) return { kind: 'track', by: 'confirm-date' };
  if (timing === 'upcoming') return { kind: 'track', by: hasRisk || conflict !== null ? 'check-promise' : 'confirmed-date' };
  if (timing === 'needs-review' || unshippedQty === null || unshippedQty <= 0 || unit === null) return null;
  return { kind: 'expedite', qty: unshippedQty, unit };
}

function weeklyReceiptAction({ outstandingQty, unshippedQty }: OrderPlanningBatch['facts'], reviewCount: number): WeeklyOrderAction | null {
  if (outstandingQty !== null && unshippedQty !== null && outstandingQty > unshippedQty) return { kind: 'check-receipt', reason: 'checked-shipment' };
  if (reviewCount > 0 || outstandingQty === null || unshippedQty === null) return { kind: 'check-receipt', reason: 'incomplete-evidence' };
  return null;
}

function overdueDelivery(confirmed: LocalDate | null, { window, today }: Pick<WeeklyInput, 'window' | 'today'>): DeliveryFact['overdue'] {
  if (confirmed === null || confirmed >= today) return null;
  return { start: addDays(confirmed, 1), days: diffDays(today, confirmed), isCarried: confirmed < window.from };
}

export function hasOutstandingDelivery({ status, fulfillment, plannedQty }: {
  readonly status: DeliveryScheduleBatch['status'];
  readonly fulfillment?: Pick<DeliveryScheduleBatch['fulfillment'], 'receivedQty'> | undefined;
  readonly plannedQty: number;
}): boolean {
  return (isOpenBatch(status) || status === 'received') && (fulfillment?.receivedQty == null || fulfillment.receivedQty < plannedQty);
}

function nextWeekRisk({ batch, tasks }: DeliveryCandidate, next: ScheduleWindow): DeliveryFact['nextRisk'] {
  const { confirmed, required, supplierPromised } = batch;
  const candidates = [required, confirmed].filter((date) => date !== null);
  const due = (candidates.length === 0 && supplierPromised !== null ? [supplierPromised] : candidates)
    .filter((date) => dateInWindow(date, next)).sort().at(0);
  if (due === undefined) return null;
  const reasons = deliveryRiskReasons({ batch, tasks }, due);
  return reasons.length === 0 ? null : { date: due, reasons };
}

function deliveryRiskReasons({ batch, tasks }: DeliveryCandidate, due: LocalDate) {
  const { confirmed, required, supplierPromised, fulfillment } = batch;
  return [
    confirmed === null ? '采购交期待确认' : null,
    confirmed !== null && required !== null && required < confirmed ? '采购确认晚于工厂需求' : null,
    supplierPromised !== null && supplierPromised > due ? '供应商承诺晚于应到' : null,
    tasks.some(({ task, conflicts }) => task.plannedStart <= due && conflicts.length > 0) ? '前置任务阻塞' : null,
    needsFulfillmentReview(fulfillment) ? '发收货记录待核实' : null,
  ].filter((reason) => reason !== null);
}

function needsFulfillmentReview({ reviewCount, receivedQty, unshippedQty }: DeliveryScheduleBatch['fulfillment']): boolean {
  return reviewCount > 0 || receivedQty === null || unshippedQty === null;
}

export function tasksByBatch(tasks: readonly DeliveryScheduleTask[]): BatchDependencies {
  const grouped = new Map<string, DeliveryScheduleTask[]>();
  for (const entry of tasks) {
    const id = entry.task.batch?.id;
    if (id === undefined) continue;
    const bucket = grouped.get(id);
    if (bucket === undefined) grouped.set(id, [entry]);
    else bucket.push(entry);
  }
  return grouped;
}

function matchesKeyword({ batch, tasks }: DeliveryCandidate, { order, needle }: { readonly order: OrderLineRow | undefined; readonly needle: string }): boolean {
  if (needle === '') return true;
  return [batch.orderName, batch.poRaw, batch.oaRef, batch.itemCode, ...tasks.map(({ task }) => task.title),
    ...(order === undefined ? [] : planningOrderFields(order)),
  ].some((field) => field?.toLocaleLowerCase().includes(needle));
}

function matchesFilters({ batch, tasks }: DeliveryCandidate, filters: ScheduleFilters): boolean {
  return matchesDeliveryParties(batch, filters) && (filters.status === null || tasks.some(({ task }) => task.status === filters.status));
}

export function weeklyDeliveryFilterOptions(batches: readonly DeliveryScheduleBatch[], base: ScheduleOptions): ScheduleOptions {
  return {
    owners: batchOptions(batches, { field: 'buyer', options: base.owners, missing: '未分配' }),
    suppliers: batchOptions(batches, { field: 'supplier', options: base.suppliers, missing: '未指定供应商' }),
    factories: batchOptions(batches, { field: 'factory', options: base.factories, missing: '未指定工厂' }),
  };
}

function batchOptions(batches: readonly DeliveryScheduleBatch[], { field, options, missing }: {
  readonly field: 'buyer' | 'supplier' | 'factory'; readonly options: ScheduleOptions['owners']; readonly missing: string;
}) {
  const labels = new Map(options.map(({ value, label }) => [value, label]));
  for (const batch of batches) {
    const party = batch[field];
    const value = party?.id ?? 'unassigned';
    if (!labels.has(value)) labels.set(value, party === null ? missing : party.name ?? party.id);
  }
  return [...labels].map(([value, label]) => ({ value, label }));
}

function bucketGroup({ key, title, deliveries }: { readonly key: string; readonly title: string; readonly deliveries: readonly DeliveryFact[] },
  context: Pick<WeeklyInput, 'window' | 'today'>): PlanningGroup {
  const sorted = [...deliveries].sort((left, right) => {
    const leftDate = left.nextRisk?.date ?? left.batch.confirmed ?? left.batch.receiptDates[0] ?? context.window.to;
    const rightDate = right.nextRisk?.date ?? right.batch.confirmed ?? right.batch.receiptDates[0] ?? context.window.to;
    return leftDate.localeCompare(rightDate) || left.batch.id.localeCompare(right.batch.id);
  });
  const carried = deliveries.filter(({ overdue }) => overdue?.isCarried === true);
  const carry = carried.length === 0 ? '' : carried.some(({ source }) => source.weeklyDelivery.timing === 'overdue')
    ? ' · 含前期逾期' : ' · 含前期待核';
  const heading = key === 'outstanding' ? '待交批次' : key === 'expected' ? '应到批次' : key === 'nextRisk' ? '风险批次' : title;
  return { key: `weekly:${key}`, title: heading, meta: `${deliveries.length} 批${carry}`, rows: sorted.map((entry) => deliveryRow(entry, context)) };
}

function deliveryRow(entry: DeliveryFact, context: Pick<WeeklyInput, 'window' | 'today'>): PlanningRow {
  const { batch, source, nextRisk } = entry;
  const dependencyConflicts = [...new Map(entry.tasks.flatMap(({ conflicts }) => conflicts.map((item) => [item.id, item] as const))).values()];
  return {
    id: `batch:${batch.id}`, source: { kind: 'batch', batch: source },
    title: `${batch.orderName ?? batch.poRaw ?? '成品订单'} · 批次 ${batch.seq}`,
    orderIdentity: { product: batch.orderName, po: batch.poRaw },
    ...(nextRisk === null ? {} : { nextRiskOn: nextRisk.date }),
    meta: batch.orderName === null ? '' : batch.poRaw ?? '',
    ...deliveryRowDates(entry, context), status: planningBatchStatus(source), dependencyConflicts,
  };
}

function deliveryRowDates({ batch, nextRisk, overdue, source }: DeliveryFact, context: Pick<WeeklyInput, 'window' | 'today'>) {
  const { window, today } = context;
  const { points, currentReceipts } = deliveryPoints(batch, window);
  const overdueText = overdue === null ? null : `${source.weeklyDelivery.timing === 'overdue' ? '逾期待收' : '已过确认日'} ${overdue.days} 天`;
  const actual = currentReceipts.length === 0 ? null : `实际收货 ${currentReceipts.map((date) => shortDate(date, today)).join('、')}`;
  const next = nextRisk === null ? null : `下周 ${shortDate(nextRisk.date, today)} · ${nextRisk.reasons.join('、')}`;
  const recordDate = overdueText ?? next;
  return {
    when: [overdueText, actual, next].filter(Boolean).join(' · '),
    bar: overdue === null || overdueText === null ? null : overdueDeliveryBar({ start: overdue.start, label: overdueText }, context),
    ...(recordDate === null ? {} : { recordDate }),
    ...(next === null ? {} : { risk: next }),
    points,
  };
}

function overdueDeliveryBar({ start, label }: { readonly start: LocalDate; readonly label: string }, { today, window }: Pick<WeeklyInput, 'window' | 'today'>): TimelineBar | null {
  if (start > window.to || today < window.from) return null;
  return { ...scheduleIntervalGeometry({ from: start, to: today }, window), tone: 'warning', label };
}

function deliveryPoints(batch: DeliveryScheduleBatch, window: ScheduleWindow) {
  const currentReceipts = batch.receiptDates.filter((date) => dateInWindow(date, window));
  const points: PlanningPoint[] = currentReceipts.map((date) => ({ kind: 'received', date }));
  if (batch.confirmed !== null && dateInWindow(batch.confirmed, window)) points.unshift({ kind: 'confirmed', date: batch.confirmed });
  return { points, currentReceipts };
}
