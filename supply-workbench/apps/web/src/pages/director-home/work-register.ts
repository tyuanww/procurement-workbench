import type { OrderLineRow, ProcurementStore } from '@sw/contracts';
import { addDays, LINE_STAGES, type LocalDate } from '@sw/domain';
import { fetchLines } from '../../shared/api/catalog.js';

const ACTIVE_STAGES = LINE_STAGES.filter((stage) => stage !== 'done' && stage !== 'cancelled').join(',');
const PAGE_SIZE = 200;
const UNASSIGNED = 'unassigned';
export const SIGNALS = {
  overdue: '已逾期', late: '确认到货晚于需求', exception: '异常未关闭',
  missing: '待确认交期', unassigned: '待分配负责人', soon: '7 天内应到',
} as const;
const signalPriority = Object.keys(SIGNALS);
export type Signal = keyof typeof SIGNALS;
export type View = 'all' | 'risk' | 'watch';
export type WorkFilter = { view: View; owner: string | undefined; signal: Signal | undefined; search: string };
export const initialFilter: WorkFilter = { view: 'watch', owner: undefined, signal: undefined, search: '' };

export const VIEWS: Record<View, string> = { all: '进行中事项', risk: '交期风险', watch: '需要关注' };
export type WorkRow = {
  readonly line: OrderLineRow;
  readonly signals: readonly Signal[];
  readonly related: readonly OrderLineRow[];
  readonly ownerId: string;
};

export async function loadWorkLines(store: ProcurementStore, signal: AbortSignal) {
  const page = (number: number) => fetchLines(new URLSearchParams({
    stages: ACTIVE_STAGES, store, page: String(number), pageSize: String(PAGE_SIZE),
  }).toString(), signal);
  const first = await page(1);
  const lines = [...first.items];
  for (let number = 2; number <= Math.ceil(first.page.total / PAGE_SIZE); number++) {
    lines.push(...(await page(number)).items);
  }
  return [...new Map(lines.map((line) => [line.id, line])).values()];
}

function dateSignals(line: OrderLineRow, period: { today: LocalDate; end: LocalDate }): Signal[] {
  const { today, end } = period;
  const signals: Signal[] = [];
  const date = line.nextDue?.dateBuyerConfirmed;
  const demand = line.nextDue?.dateFactoryRequired;
  if (!date) return signals;
  if (date < today) signals.push('overdue');
  if (demand && demand < date) signals.push('late');
  if (date >= today && date < end) signals.push('soon');
  return signals;
}

function lineSignals(line: OrderLineRow, period: { today: LocalDate; end: LocalDate }): Signal[] {
  const signals = dateSignals(line, period);
  if (line.openExceptionCount > 0) signals.push('exception');
  if (line.stage === 'awaiting_date') signals.push('missing');
  if (line.buyer === null) signals.push('unassigned');
  return signals.sort((a, b) => signalPriority.indexOf(a) - signalPriority.indexOf(b));
}

export function workRows(lines: readonly OrderLineRow[], today: LocalDate): WorkRow[] {
  const parents = new Map<string, OrderLineRow[]>();
  for (const line of lines) {
    for (const material of line.storeProgress?.materials ?? []) {
      const products = parents.get(material.id) ?? [];
      products.push(line);
      parents.set(material.id, products);
    }
  }
  const end = addDays(today, 7);
  return lines.map((line) => ({
    line, signals: lineSignals(line, { today, end }), related: parents.get(line.id) ?? [], ownerId: line.buyer?.id ?? UNASSIGNED,
  })).sort((a, b) => priorityOf(a) - priorityOf(b) || dateOf(a).localeCompare(dateOf(b)) || a.line.id.localeCompare(b.line.id));
}

function priorityOf(row: WorkRow) {
  const first = row.signals[0];
  return first === undefined ? signalPriority.length : signalPriority.indexOf(first);
}

export function dateOf(row: WorkRow): string {
  return row.line.nextDue?.dateBuyerConfirmed ?? '9999-12-31';
}

export function inView(row: WorkRow, view: View): boolean {
  if (view === 'risk') return row.signals.includes('overdue') || row.signals.includes('late');
  return view === 'all' || row.signals.length > 0;
}

export type OwnerLoad = { id: string; name: string; total: number; watch: number; risk: number };

export function ownerLoads(rows: readonly WorkRow[]): OwnerLoad[] {
  const owners = new Map<string, OwnerLoad>();
  for (const row of rows) {
    const owner = owners.get(row.ownerId) ?? { id: row.ownerId, name: row.line.buyer?.name ?? '待分配', total: 0, watch: 0, risk: 0 };
    owner.total++;
    if (inView(row, 'watch')) owner.watch++;
    if (inView(row, 'risk')) owner.risk++;
    owners.set(row.ownerId, owner);
  }
  return [...owners.values()].sort((a, b) => b.risk - a.risk || b.watch - a.watch || b.total - a.total || a.name.localeCompare(b.name, 'zh-CN'));
}

export function matchesSearch(row: WorkRow, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  const fields = [row.line.nameRaw, row.line.po.poRaw, row.line.itemCodeRaw, row.line.buyer?.name,
    ...row.related.flatMap((product) => [product.nameRaw, product.buyer?.name])];
  return fields.some((field) => field?.toLocaleLowerCase().includes(needle)) || needle === '';
}
