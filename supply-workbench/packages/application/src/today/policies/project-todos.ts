import { can, compareDates, compareUnshipped, diffDays, localDate, type BatchFulfillment, type LocalDate, type Settings } from '@sw/domain';
import type { Actor } from '../../shared/actor.js';
import type { TodoItem, TodoInput } from '../views.js';
import { TODO_RULES, MID_SEVERITY, type TodoContext, type TodoRule, type WaitingOn } from './rules.js';

export type ProjectedTodo = Omit<TodoItem, 'reasons'> & {
  readonly reasons: readonly string[];
  readonly remaining?: BatchFulfillment;
  readonly nextFollowUpAt?: string;
  readonly reminderWaitingOn?: WaitingOn;
};

export function projectTodos({ input, today, now, settings, rules = TODO_RULES }: {
  readonly input: TodoInput;
  readonly today: LocalDate;
  readonly now: string;
  readonly settings: Settings;
  readonly rules?: readonly TodoRule[];
}): ProjectedTodo[] {
  const ctx = { today, now: Date.parse(now), settings };
  const batches = input.batches.flatMap((batch) => projectBatch({ batch, ctx, rules }));
  const exceptions = input.exceptions.map(projectException);
  const review = projectReview(input.reviewCounts);
  const imports = input.uncommittedImports.flatMap((item) => projectImport(item, today));
  return [...batches, ...exceptions, ...review, ...imports].sort(byUrgency);
}

export function filterTodosForUser({ todos, actor, scope }: { readonly todos: readonly ProjectedTodo[]; readonly actor: Actor; readonly scope: 'mine' | 'all' }): ProjectedTodo[] {
  return todos.filter((todo) => visible({ todo, actor, scope }));
}

export function projectBatch({ batch, ctx, rules }: { readonly batch: TodoInput['batches'][number]; readonly ctx: TodoContext; readonly rules: readonly TodoRule[] }): ProjectedTodo[] {
  const matched = rules.filter((rule) => rule.reason !== 'unassigned' && rule.applies(batch, ctx));
  if (matched.length === 0) return [];
  const reasons = matched.map((rule) => rule.reason);
  if (batch.ownerUserId === null) reasons.push('unassigned');
  const lead = matched.reduce((current, rule) => (rule.severity(batch, ctx) > current.severity(batch, ctx) ? rule : current));
  const reminder = matched.find((rule) => isFollowUpReason(rule.reason));
  return [{
    id: `batch:${batch.id}`,
    subject: 'batch',
    reasons,
    severity: lead.severity(batch, ctx),
    ownerUserId: batch.ownerUserId,
    waitingOn: lead.waitingOn(batch),
    ...(reasons.includes('unshipped') ? { remaining: batch.fulfillment } : {}),
    ...(batch.nextFollowUpAt === undefined || reminder === undefined ? {} : {
      nextFollowUpAt: batch.nextFollowUpAt, reminderWaitingOn: reminder.waitingOn(batch),
    }),
    dueDate: batch.dateBuyerConfirmed,
    overdueDays: batch.overdueDays,
    refs: { orderLineId: batch.orderLineId, batchId: batch.id },
  }];
}

function isFollowUpReason(code: string): boolean {
  return code === 'follow_up_due' || code === 'follow_up_scheduled';
}

function projectException(exception: TodoInput['exceptions'][number]): ProjectedTodo {
  return {
    id: `exception:${exception.id}`,
    subject: 'exception',
    reasons: ['exception_open'],
    severity: MID_SEVERITY,
    ownerUserId: exception.openedBy,
    waitingOn: { kind: 'internal', partyId: null },
    dueDate: null,
    overdueDays: null,
    refs: { orderLineId: exception.orderLineId, exceptionId: exception.id, ...(exception.batchId === null ? {} : { batchId: exception.batchId }) },
  };
}

function projectReview(counts: TodoInput['reviewCounts']): ProjectedTodo[] {
  const pending = counts.aliases + counts.codes + counts.links + counts.multiName;
  if (pending === 0) return [];
  return [{
    id: 'review',
    subject: 'review',
    reasons: ['review_pending'],
    severity: 1,
    ownerUserId: null,
    waitingOn: { kind: 'internal', partyId: null },
    dueDate: null,
    overdueDays: null,
    refs: {},
  }];
}

function projectImport(item: TodoInput['uncommittedImports'][number], today: LocalDate): ProjectedTodo[] {
  const day = item.createdAt.split('T')[0];
  if (day === undefined || diffDays(today, localDate(day)) <= 1) return [];
  return [{
    id: `import:${item.id}`,
    subject: 'import',
    reasons: ['import_pending'],
    severity: 1,
    ownerUserId: item.createdBy,
    waitingOn: { kind: 'internal', partyId: null },
    dueDate: null,
    overdueDays: null,
    refs: { importBatchId: item.id },
  }];
}

function visible({ todo, actor, scope }: { readonly todo: ProjectedTodo; readonly actor: Actor; readonly scope: 'mine' | 'all' }): boolean {
  if (todo.subject === 'review' && !can(actor, 'master.review')) return false;
  if (scope === 'all') return true;
  return todo.ownerUserId === actor.id || todo.ownerUserId === null;
}

export function byUrgency(left: ProjectedTodo, right: ProjectedTodo): number {
  if (left.severity !== right.severity) return right.severity - left.severity;
  const overdue = rank(right.overdueDays) - rank(left.overdueDays);
  if (overdue !== 0) return overdue;
  const due = compareDue(left.dueDate, right.dueDate);
  if (due !== 0) return due;
  const remaining = compareUnshipped(left.remaining, right.remaining);
  if (remaining !== 0) return remaining;
  return (left.refs.orderLineId ?? left.id).localeCompare(right.refs.orderLineId ?? right.id) || left.id.localeCompare(right.id);
}

function rank(days: number | null): number {
  return days === null ? -1 : days;
}

function compareDue(left: LocalDate | null, right: LocalDate | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return compareDates(left, right);
}
