import { compareUnshipped, type BatchFulfillment } from '@sw/domain';

export type TodoRow = {
  readonly id: string;
  readonly severity: number;
  readonly overdueDays: number | null;
  readonly dueDate: string | null;
  readonly lineId: string;
  readonly waitingName: string;
  readonly waitingKey?: string;
  readonly remaining?: BatchFulfillment;
  readonly reasons: readonly string[];
};

export function sortTodos<T extends TodoRow>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => compareTodos(left, right));
}

export function groupByWaiting<T extends TodoRow>(rows: readonly T[]): { readonly key: string; readonly name: string; readonly items: readonly T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of sortTodos(rows)) {
    const key = row.waitingKey ?? row.waitingName;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups].map(([key, items]) => ({ key, name: items[0]?.waitingName ?? key, items }));
}

export function filterReasons<T extends TodoRow>(rows: readonly T[], reasons: readonly string[]): T[] {
  if (reasons.length === 0) return [...rows];
  return rows.filter((row) => row.reasons.some((reason) => reasons.includes(reason)));
}

export function nextFocus(rows: readonly { readonly id: string }[], removedId: string): string | null {
  const index = rows.findIndex((row) => row.id === removedId);
  if (index < 0) return rows[0]?.id ?? null;
  return rows[index + 1]?.id ?? rows[index - 1]?.id ?? null;
}

export function shortcutAction(key: string): 'down' | 'up' | 'date' | 'ship' | 'receipt' | 'note' | 'exception' | 'help' | null {
  if (key === 'j') return 'down';
  if (key === 'k') return 'up';
  if (key === 'd') return 'date';
  if (key === 's') return 'ship';
  if (key === 'r') return 'receipt';
  if (key === 'n') return 'note';
  if (key === 'e') return 'exception';
  if (key === '?') return 'help';
  return null;
}

function compareTodos(left: TodoRow, right: TodoRow): number {
  if (left.severity !== right.severity) return right.severity - left.severity;
  const overdue = (right.overdueDays ?? -1) - (left.overdueDays ?? -1);
  if (overdue !== 0) return overdue;
  return compareDue(left, right);
}

function compareDue(left: TodoRow, right: TodoRow): number {
  if (left.dueDate === right.dueDate) return compareUnshipped(left.remaining, right.remaining) || compareLine(left.lineId, right.lineId);
  if (left.dueDate === null) return 1;
  if (right.dueDate === null) return -1;
  if (left.dueDate < right.dueDate) return -1;
  if (left.dueDate > right.dueDate) return 1;
  return 0;
}

function compareLine(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
