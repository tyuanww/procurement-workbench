import type { DeliveryScheduleBatch, DeliveryScheduleTask, OrderLineRow, ProductDevelopment, ProductDevelopmentNode, ProductDevelopmentProject, WorkItemPredecessor } from '@sw/contracts';
import { batchStatusLabel, DEVELOPMENT_DESTINATION_LABELS, diffDays, type BatchStatus, type LocalDate } from '@sw/domain';
import {
  applyScheduleFilters, scheduleBarOf, scheduleOptions,
  type PlanningScope, type ScheduleFilters, type ScheduleOptions, type ScheduleWindow, type TimelineBar,
} from '../../features/progress/index.js';
import {
  ownerText, plannedRangeText, shortDate, taskParam, workItemSourceLabel, workItemStatusLabel, workItemStatusTone, type TaskTone, type WorkItem,
} from '../../features/today/index.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { planningBatchesBySource, scheduledBatchProjection, planningBatchRefs, type DevelopmentPlanningBatch, type NodeSource, type OrderPlanningBatch, type PlanningBatch, type WeeklyOrderAction, type WeeklyOrderDelivery } from './planning-batches.js';
import { developmentForecast, developmentRiskOf, needsDevelopmentReply, nodeWaitingText } from './product-development-forecast.js';
import { progressOrderRef } from './store-order.js';
import { storeLabels } from './store-query.js';

export type { PlanningScope } from '../../features/progress/index.js';
export type PlanningDisplay = 'gantt' | 'list';
export type PlanningSource = { readonly kind: 'task'; readonly item: WorkItem }
  | NodeSource
  | { readonly kind: 'batch'; readonly batch: PlanningBatch };

export type PlanningPoint =
  { readonly kind: 'requirement' | 'confirmed' | 'received' | 'milestone'; readonly date: LocalDate };

export const planningPointLabel: Readonly<Record<PlanningPoint['kind'], string>> = {
  requirement: '项目要求', confirmed: '采购确认', received: '实际收货', milestone: '里程碑',
};

export type PlanningRow = {
  readonly id: string;
  readonly source: PlanningSource;
  readonly title: string;
  readonly orderIdentity?: { readonly product: string | null; readonly po: string | null };
  readonly meta: string;
  readonly when: string;
  readonly recordDate?: string;
  readonly status: { readonly label: string; readonly tone: TaskTone };
  readonly bar: TimelineBar | null;
  readonly points: readonly PlanningPoint[];
  readonly dependencyConflicts?: readonly WorkItemPredecessor[] | undefined;
  readonly risk?: string | undefined;
  readonly nextRiskOn?: LocalDate;
};

export type PlanningGroup = {
  readonly key: string;
  readonly title: string;
  readonly meta: string;
  readonly rows: readonly PlanningRow[];
  readonly project?: ProductDevelopmentProject;
  readonly leadHeading?: string;
};

type Context = {
  readonly orders: ReadonlyMap<string, OrderLineRow>;
  readonly projectsByLine: ReadonlyMap<string, readonly ProductDevelopmentProject[]>;
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
};

type GroupEntry = { readonly group: Omit<PlanningGroup, 'rows'>; readonly row: PlanningRow };
type PlanningInput = {
  readonly scope: PlanningScope;
  readonly items: readonly WorkItem[];
  readonly development: ProductDevelopment | null;
  readonly orders: readonly OrderLineRow[];
  readonly selectedBatches: readonly OrderPlanningBatch[];
  readonly deliveryBatches?: readonly DeliveryScheduleBatch[] | undefined;
  readonly deliveryTasks?: readonly DeliveryScheduleTask[] | undefined;
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly filters: ScheduleFilters;
  readonly query: string;
  readonly conflicts: Readonly<Record<string, readonly WorkItemPredecessor[]>>;
};

export function planningGroups(input: PlanningInput): readonly PlanningGroup[] {
  const projects = input.development?.projects ?? [];
  const nodes = projects.flatMap(nodesOf);
  const context: Context = { ...input, orders: new Map(input.orders.map((row) => [row.id, row])), projectsByLine: linkedProjects(nodes) };
  const groups = new Map<string, PlanningGroup & { rows: PlanningRow[] }>();
  const matches = matchPlanningQuery(input.query);
  const entries = [
    ...(input.scope === 'orders' ? [] : developmentEntries({ ...input, nodes, context, matches })),
    ...(input.scope === 'development'
      ? planningBatchRows({ ...input, nodes, selectedBatches: [], deliveryBatches: undefined, context, matches })
      : orderEntries({ ...input, nodes, context, matches })),
  ];
  for (const { group, row } of entries) {
    const existing = groups.get(group.key);
    if (existing === undefined) groups.set(group.key, { ...group, rows: [row] });
    else existing.rows.push(row);
  }
  return [...groups.values()];
}

export function planningTasks({ items, filters, query, window, orders, development }: Pick<PlanningInput,
  'items' | 'filters' | 'query' | 'window' | 'orders' | 'development'>): readonly WorkItem[] {
  return matchingScheduleItems({ items, filters, matches: matchPlanningQuery(query), context: {
    window, orders: new Map(orders.map((row) => [row.id, row])),
    projectsByLine: linkedProjects(development?.projects.flatMap(nodesOf) ?? []),
  } });
}

function matchPlanningQuery(query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return (values: readonly (string | null | undefined)[]) => values.some((value) => value?.toLocaleLowerCase().includes(needle));
}

function nodesOf(project: ProductDevelopmentProject): readonly NodeSource[] {
  return project.nodes.map((node) => ({ kind: 'development', project, node }));
}

function linkedProjects(nodes: readonly NodeSource[]): Context['projectsByLine'] {
  const grouped = new Map<string, Map<string, ProductDevelopmentProject>>();
  for (const { node, project } of nodes) {
    if (node.formalLink === null) continue;
    for (const id of new Set([node.formalLink.orderLineId, node.formalLink.procurementLineId])) {
      const related = grouped.get(id) ?? new Map<string, ProductDevelopmentProject>();
      related.set(project.id, project);
      grouped.set(id, related);
    }
  }
  return new Map([...grouped].map(([id, related]) => [id, [...related.values()]]));
}

export const planningOrderFields = (order: OrderLineRow): readonly (string | null)[] =>
  [progressOrderRef(order), order.nameRaw, order.po.poRaw, order.itemCodeRaw];

function orderFields(order: OrderLineRow | undefined): readonly (string | null)[] {
  return order === undefined ? [] : planningOrderFields(order);
}

function linkedLine(item: WorkItem): string | null {
  return item.orderLine?.id ?? item.batch?.orderLineId ?? (item.subjectType === 'order_line' ? item.subjectId : null);
}

function projectGroup(project: ProductDevelopmentProject): GroupEntry['group'] {
  const refs = [...new Set(project.nodes.flatMap((node) => node.formalLink?.oaRef ?? []))];
  return { key: `development:${project.id}`, title: project.title, project,
    meta: [storeLabels[project.store], '新品项目', refs.length === 0 ? '尚未关联 OA' : refs.join('、')].join(' · ') };
}

function orderGroup(item: WorkItem, context: Context): GroupEntry['group'] {
  const id = linkedLine(item);
  if (id === null) return { key: 'tasks', title: '其他任务', meta: '' };
  const known = context.orders.get(id);
  const related = context.projectsByLine.get(id) ?? [];
  const [project] = related;
  if (related.length === 1 && project !== undefined) return projectGroup(project);
  return { key: `order:${id}`, ...orderGroupLabels({ known, source: item.orderLine }) };
}

function orderGroupLabels({ known, source }: { readonly known: OrderLineRow | undefined; readonly source: WorkItem['orderLine'] }) {
  const po = [known?.po.poRaw, source?.poRaw].find(Boolean);
  const store = known?.storeProgress?.store;
  return {
    title: [known?.nameRaw, source?.nameRaw, po].find(Boolean) ?? '订单排期',
    meta: [store === undefined ? null : storeLabels[store], known === undefined ? null : progressOrderRef(known), po].filter(Boolean).join(' · '),
  };
}

type EntryInput = PlanningInput & {
  readonly nodes: readonly NodeSource[];
  readonly context: Context;
  readonly matches: (values: readonly (string | null | undefined)[]) => boolean;
};

function developmentEntries({ nodes, context, filters, matches }: EntryInput): readonly GroupEntry[] {
  return nodes.filter(({ project, node }) => {
    const order = node.formalLink === null ? undefined : context.orders.get(node.formalLink.orderLineId);
    return inWindow(node, context.window) && nodeMatchesFilters(node, filters)
      && matches([project.title, node.title, node.formalLink?.oaRef, ...orderFields(order)]);
  }).map((source) => ({ group: projectGroup(source.project), row: developmentRow(source, context) }));
}

function developmentRow(source: NodeSource, { window, today }: Context): PlanningRow {
  const { node, project } = source;
  const risk = developmentRiskOf(node);
  const status = developmentRowStatus(node, risk);
  const forecast = developmentForecast(node);
  const when = forecast.kind === 'late' ? `预计晚 ${forecast.days} 天` : node.latestReply === null ? ''
    : `新品阶段承诺 ${shortDate(node.latestReply.promisedOn, today)}`;
  return {
    id: `development:${project.id}:${node.id}`, source, title: node.title,
    meta: [DEVELOPMENT_DESTINATION_LABELS[node.destination], `负责人 ${node.ownerName ?? '未分配'}`, nodeWaitingText(node),
      node.formalLink === null ? '' : '已关联 OA'].filter(Boolean).join(' · '),
    risk: risk ?? undefined,
    status, when: [`计划 ${shortDate(node.plannedStart, today)} 至 ${shortDate(node.plannedEnd, today)}`, when].filter(Boolean).join(' · '),
    bar: node.plannedStart === node.plannedEnd ? null : scheduleBarOf({ ...node, overdueDays: overdue(node.daysUntilRequired) }, window),
    points: dateInWindow(node.plannedEnd, window) ? [{ kind: 'requirement', date: node.plannedEnd }] : [],
  };
}

function developmentRowStatus(node: ProductDevelopmentNode, risk: string | null): PlanningRow['status'] {
  if (risk !== null) return { label: risk, tone: node.status === 'blocked' ? 'danger' : 'warning' };
  if (needsDevelopmentReply(node)) return { label: '待我回复', tone: 'info' };
  return { label: workItemStatusLabel(node.status), tone: workItemStatusTone(node.status) };
}

function orderEntries(input: EntryInput): readonly GroupEntry[] {
  const { context, conflicts } = input;
  const tasks = matchingScheduleItems(input).map((item): GroupEntry => ({ group: orderGroup(item, context), row: orderRow(item, { context, conflicts }) }));
  const batchEntries = planningBatchRows({ ...input, deliveryBatches: input.deliveryBatches ?? (input.scope === 'orders' ? [] : undefined) });
  return [...tasks, ...batchEntries];
}

function matchingScheduleItems({ context, items, filters, matches }: Pick<EntryInput, 'items' | 'filters' | 'matches'> & {
  readonly context: Pick<Context, 'window' | 'orders' | 'projectsByLine'>;
}): readonly WorkItem[] {
  return applyScheduleFilters({ items, filters }).filter((item) => {
    const id = linkedLine(item);
    const projects = id === null ? [] : context.projectsByLine.get(id) ?? [];
    const known = id === null ? undefined : context.orders.get(id);
    return inWindow(item, context.window) && matches([item.title, item.orderLine?.poRaw, item.orderLine?.nameRaw,
      ...projects.flatMap((project) => [project.title, ...project.nodes.filter((node) =>
        node.formalLink?.orderLineId === id || node.formalLink?.procurementLineId === id).map((node) => node.formalLink?.oaRef)]), ...orderFields(known)]);
  });
}

function orderRow(item: WorkItem, { context, conflicts }: Pick<EntryInput, 'context' | 'conflicts'>): PlanningRow {
  const id = linkedLine(item);
  const order = id === null ? undefined : context.orders.get(id);
  return { id: taskParam(item.id), title: item.title, bar: scheduleBarOf(item, context.window),
    orderIdentity: { product: order?.nameRaw ?? item.orderLine?.nameRaw ?? null, po: order?.po.poRaw ?? item.orderLine?.poRaw ?? null },
    when: plannedRangeText(item, context.today), dependencyConflicts: conflicts[item.id],
    source: { kind: 'task', item }, points: [],
    meta: [ownerText(item), item.supplierName, item.factoryName, workItemSourceLabel(item.source)].filter(Boolean).join(' · '),
    status: { label: workItemStatusLabel(item.status), tone: workItemStatusTone(item.status) } };
}

export function planningFilterOptions(items: readonly WorkItem[], projects: ProductDevelopment['projects']): ScheduleOptions {
  const options = scheduleOptions(items);
  const owners = new Map(options.owners.map((owner) => [owner.value, owner]));
  for (const { node } of projects.flatMap(nodesOf)) {
    const value = node.ownerUserId ?? 'unassigned';
    owners.set(value, { value, label: node.ownerName ?? '未分配' });
  }
  return { ...options, owners: [...owners.values()] };
}

function inWindow({ plannedStart, plannedEnd }: Pick<ProductDevelopmentNode, 'plannedStart' | 'plannedEnd'>, { from, to }: ScheduleWindow): boolean {
  return plannedStart <= to && plannedEnd >= from;
}

export function dateInWindow(date: LocalDate, { from, to }: ScheduleWindow): boolean {
  return date >= from && date <= to;
}

export function pointPosition(date: LocalDate, { from, to }: ScheduleWindow): number {
  return 100 * (diffDays(date, from) + 0.5) / (diffDays(to, from) + 1);
}

export function nodeMatchesFilters(node: ProductDevelopmentNode, filters: ScheduleFilters): boolean {
  return (filters.status === null || filters.status === node.status)
    && filters.supplierPartyId === null && filters.factoryPartyId === null
    && (filters.ownerUserId === null || filters.ownerUserId === (node.ownerUserId ?? 'unassigned'));
}

function overdue(days: number | null): number | null {
  return days !== null && days < 0 ? -days : null;
}

function planningBatchRows({ context, matches, filters, deliveryBatches, deliveryTasks, ...sources }:
  Pick<EntryInput, 'nodes' | 'selectedBatches' | 'deliveryBatches' | 'deliveryTasks' | 'context' | 'matches' | 'filters'>): readonly GroupEntry[] {
  const scheduled = scheduledBatchProjection({ deliveryBatches, deliveryTasks, filters });
  const hasFilters = Object.values(filters).some((value) => value !== null);
  return planningBatchesBySource({ ...sources, deliveryBatches }).flatMap((batch) => {
    const order = context.orders.get(batch.orderLineId);
    const linked = batch.node;
    const delivery = scheduled.get(batch.id);
    const isFilterMatch = delivery === undefined ? linked === undefined ? !hasFilters : nodeMatchesFilters(linked.node, filters) : scheduled.matches(delivery);
    if (!isFilterMatch || !matches([...planningBatchRefs({ batch, delivery }), ...orderFields(order)])) return [];
    const row = batchRow(batch, context);
    if (row.points.length === 0) return [];
    const group = linked === undefined ? { key: `order:${batch.orderLineId}`, title: batch.orderName ?? '订单排期',
      meta: orderFields(order).filter(Boolean).slice(0, 1).join('') } : projectGroup(linked.project);
    return [{ group, row }];
  });
}

function batchRow(batch: PlanningBatch, { window, today }: Context): PlanningRow {
  const confirmed = batch.timelineConfirmed;
  const received = batch.receiptDates.map((date): PlanningPoint => ({ kind: 'received', date }));
  const markers: PlanningPoint[] = confirmed === null ? received : [{ kind: 'confirmed', date: confirmed }, ...received];
  const points = markers.filter((point) => dateInWindow(point.date, window));
  const dates = batch.kind === 'order' ? points.filter((point) => point.kind === 'received') : points;
  return { id: `batch:${batch.id}`, source: { kind: 'batch', batch }, title: `要货批次 ${batch.seq}`,
    meta: batch.kind === 'order' ? '' : [batch.owner, developmentBatchQuantity(batch)].filter(Boolean).join(' · '),
    when: dates.map((point) => `${planningPointLabel[point.kind]} ${shortDate(point.date, today)}`).join(' · '),
    status: planningBatchStatus(batch), bar: null, points,
  };
}

function developmentBatchQuantity({ received, plannedQty, unit }: DevelopmentPlanningBatch): string {
  if (received === null) return plannedQty === null ? '实收待核实' : `实收待核实 · 计划 ${formatQuantity(plannedQty)} ${unit ?? ''}`.trim();
  const quantity = [received, plannedQty].filter((value) => value !== null).map(formatQuantity).join(' / ');
  return `确认实收 ${quantity} ${unit ?? ''}`.trim();
}

const batchTones: Record<BatchStatus, TaskTone> = {
  awaiting_date: 'warning', confirmed: 'info', shipped: 'info', partially_received: 'info',
  received: 'success', closed: 'neutral', cancelled: 'neutral',
};

export function planningBatchStatus(batch: Pick<PlanningBatch, 'status' | 'receiptDates'>): PlanningRow['status'] {
  if (batch.status !== null) return { label: batchStatusLabel(batch.status), tone: batchTones[batch.status] };
  return batch.receiptDates.length > 0 ? { label: '有实收记录', tone: 'success' } : { label: '已确认交期', tone: 'info' };
}


const weeklyTrackingLabels = {
  'confirmed-date': '按交期跟踪',
  'check-promise': '核对交期承诺',
  'confirm-date': '核对采购确认交期',
} satisfies Record<Extract<WeeklyOrderAction, { kind: 'track' }>['by'], string>;

export function weeklyActionLabel(action: WeeklyOrderAction): string {
  switch (action.kind) {
    case 'expedite': return `催发货 ${formatQuantity(action.qty)} ${action.unit}`;
    case 'check-receipt': return action.reason === 'checked-shipment' ? '核对收货记录' : '核对发收货记录';
    case 'track': return weeklyTrackingLabels[action.by];
  }
}

const weeklyTimingStatus = {
  overdue: { label: '已逾期', tone: 'danger' },
  upcoming: { label: '尚未到期', tone: 'info' },
  'due-today': { label: '今日到期', tone: 'warning' },
  'needs-review': { label: '信息待核', tone: 'warning' },
} satisfies Record<Exclude<WeeklyOrderDelivery['timing'], 'settled'>, PlanningRow['status']>;

export function weeklyDeliveryStatus({ timing, elapsedDays, fallback }: {
  readonly timing: WeeklyOrderDelivery['timing']; readonly elapsedDays: number | null; readonly fallback: PlanningRow['status'];
}): PlanningRow['status'] {
  if (timing === 'settled') return fallback;
  if (timing === 'overdue' && elapsedDays !== null) return { ...weeklyTimingStatus.overdue, label: `逾期 ${elapsedDays} 天` };
  return weeklyTimingStatus[timing];
}
