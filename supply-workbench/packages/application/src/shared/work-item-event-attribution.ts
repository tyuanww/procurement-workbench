import type { WorkItemEventKind } from '../../../domain/src/entities/work-items.js';
import type { EventActor, EventOwner, WorkItemEventView } from '../ports/plan-views.js';

export type AttributableWorkItemEvent = {
  readonly id: string;
  readonly workItemId: string;
  readonly kind: WorkItemEventKind;
  readonly field: string | null;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly actorUserId: string;
  readonly note: string | null;
  readonly createdAt: string;
};

type RecordedOwner =
  | { readonly presence: 'recorded'; readonly userId: string | null }
  | { readonly presence: 'missing' };

const MISSING: RecordedOwner = { presence: 'missing' };
const FRACTION_DIGITS = 6;
const HOUR_DIGITS = 2;
const MINUTE_DIGITS = 2;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;
const ISO_SECOND_LENGTH = 19;
const GROUP_YEAR = 1;
const GROUP_MONTH = 2;
const GROUP_DAY = 3;
const GROUP_HOUR = 4;
const GROUP_MINUTE = 5;
const GROUP_SECOND = 6;
const GROUP_FRACTION = 7;
const GROUP_ZONE = 8;

export function eventInstant(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(value.trim());
  if (match === null) return fallbackInstant(value);
  const fraction = (match[GROUP_FRACTION] ?? '').padEnd(FRACTION_DIGITS, '0').slice(0, FRACTION_DIGITS);
  const utc = Date.UTC(
    numberOf(match[GROUP_YEAR]),
    numberOf(match[GROUP_MONTH]) - 1,
    numberOf(match[GROUP_DAY]),
    numberOf(match[GROUP_HOUR]),
    numberOf(match[GROUP_MINUTE]),
    numberOf(match[GROUP_SECOND]),
  ) - offsetMs(match[GROUP_ZONE]);
  return `${new Date(utc).toISOString().slice(0, ISO_SECOND_LENGTH)}.${fraction}Z`;
}

export function eventUserIds(events: readonly AttributableWorkItemEvent[]): readonly string[] {
  const ids = new Set<string>();
  for (const event of events) collectEventIds(ids, event);
  return [...ids];
}

export function attributeWorkItemEvents(input: {
  readonly events: readonly AttributableWorkItemEvent[];
  readonly names: ReadonlyMap<string, string>;
  readonly openTimestamp?: string;
}): readonly WorkItemEventView[] {
  let owner: RecordedOwner = MISSING;
  const views: WorkItemEventView[] = [];
  const open = input.openTimestamp === undefined ? undefined : eventInstant(input.openTimestamp);
  for (const group of groupsOf(inHistoryOrder(input.events.map(normalizeEvent)))) {
    const step = attributeGroup({
      events: group.events,
      owner,
      names: input.names,
      isOpen: open !== undefined && group.at === open,
    });
    views.push(...step.views);
    owner = step.owner;
  }
  return views;
}

function attributeGroup(input: {
  readonly events: readonly AttributableWorkItemEvent[];
  readonly owner: RecordedOwner;
  readonly names: ReadonlyMap<string, string>;
  readonly isOpen: boolean;
}): { readonly views: readonly WorkItemEventView[]; readonly owner: RecordedOwner } {
  const effect = effectOf(input.events, input.owner);
  const carried = input.isOpen || effect.hasOwnerEvent ? MISSING : input.owner;
  return {
    views: input.events.map((event) => eventView({ event, carried, names: input.names, isOpen: input.isOpen })),
    owner: input.isOpen ? MISSING : effect.next,
  };
}

function eventView(input: {
  readonly event: AttributableWorkItemEvent;
  readonly carried: RecordedOwner;
  readonly names: ReadonlyMap<string, string>;
  readonly isOpen: boolean;
}): WorkItemEventView {
  const actor = actorOf(input.event.actorUserId, input.names);
  if (input.isOpen) return hiddenOwnerView({ event: input.event, actor });
  if (isOwnerStable(input.event.kind)) {
    return viewOf({ event: input.event, actor, ownerAtEvent: ownerParty(input.carried, input.names), ownerChange: null });
  }
  if (input.event.kind === 'created') {
    const owner = ownerOfCreated(input.event.newValue);
    return viewOf({ event: input.event, actor, ownerAtEvent: ownerParty(owner, input.names), ownerChange: null });
  }
  const before = ownerOfValue(input.event.oldValue);
  const after = ownerOfValue(input.event.newValue);
  return viewOf({
    event: input.event,
    actor,
    ownerAtEvent: ownerParty(after, input.names),
    ownerChange: { before: ownerParty(before, input.names), after: ownerParty(after, input.names) },
  });
}

function hiddenOwnerView(input: { readonly event: AttributableWorkItemEvent; readonly actor: EventActor }): WorkItemEventView {
  const unknown = { presence: 'unrecorded' as const };
  return viewOf({
    event: input.event,
    actor: input.actor,
    ownerAtEvent: unknown,
    ownerChange: input.event.kind === 'owner_changed' ? { before: unknown, after: unknown } : null,
  });
}

function effectOf(events: readonly AttributableWorkItemEvent[], incoming: RecordedOwner): { readonly hasOwnerEvent: boolean; readonly next: RecordedOwner } {
  const anchors = events.flatMap(anchorOf);
  if (anchors.length === 0) return { hasOwnerEvent: false, next: incoming };
  if (anchors.some((anchor) => anchor.presence === 'missing')) return { hasOwnerEvent: true, next: MISSING };
  return { hasOwnerEvent: true, next: agreedOwner(anchors) ?? createdThenChanged(events) ?? MISSING };
}

function createdThenChanged(events: readonly AttributableWorkItemEvent[]): RecordedOwner | undefined {
  const created = events.filter((event) => event.kind === 'created');
  const changed = events.filter((event) => event.kind === 'owner_changed');
  const createdEvent = created[0];
  const changedEvent = changed[0];
  if (created.length !== 1 || changed.length !== 1 || createdEvent === undefined || changedEvent === undefined) return undefined;
  const start = ownerOfCreated(createdEvent.newValue);
  const before = ownerOfValue(changedEvent.oldValue);
  const after = ownerOfValue(changedEvent.newValue);
  if (start.presence !== 'recorded' || before.presence !== 'recorded' || after.presence !== 'recorded') return undefined;
  if (start.userId !== before.userId) return undefined;
  return after;
}

function normalizeEvent(event: AttributableWorkItemEvent): AttributableWorkItemEvent {
  return { ...event, createdAt: eventInstant(event.createdAt) };
}

function fallbackInstant(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function offsetMs(zone: string | undefined): number {
  if (zone === undefined || zone === 'Z') return 0;
  const sign = zone.startsWith('-') ? -1 : 1;
  const digits = zone.slice(1).replace(':', '');
  const hours = Number(digits.slice(0, HOUR_DIGITS));
  const minutes = Number(digits.slice(HOUR_DIGITS, HOUR_DIGITS + MINUTE_DIGITS) || '0');
  return sign * (hours * MINUTES_PER_HOUR + minutes) * MS_PER_MINUTE;
}

function numberOf(value: string | undefined): number {
  return Number(value ?? '0');
}

function anchorOf(event: AttributableWorkItemEvent): readonly RecordedOwner[] {
  if (event.kind === 'created') return [ownerOfCreated(event.newValue)];
  if (event.kind === 'owner_changed') return [ownerOfValue(event.newValue)];
  return [];
}

function agreedOwner(anchors: readonly RecordedOwner[]): RecordedOwner | undefined {
  const first = anchors[0];
  if (first === undefined || first.presence !== 'recorded') return undefined;
  const isSame = anchors.every((anchor) => anchor.presence === 'recorded' && anchor.userId === first.userId);
  return isSame ? first : undefined;
}

function groupsOf(events: readonly AttributableWorkItemEvent[]): readonly { readonly at: string; readonly events: readonly AttributableWorkItemEvent[] }[] {
  const groups: { at: string; events: AttributableWorkItemEvent[] }[] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.at === event.createdAt) last.events.push(event);
    else groups.push({ at: event.createdAt, events: [event] });
  }
  return groups;
}

function viewOf(input: {
  readonly event: AttributableWorkItemEvent;
  readonly actor: EventActor;
  readonly ownerAtEvent: EventOwner;
  readonly ownerChange: WorkItemEventView['ownerChange'];
}): WorkItemEventView {
  return {
    id: input.event.id,
    workItemId: input.event.workItemId,
    kind: input.event.kind,
    field: input.event.field,
    oldValue: input.event.oldValue ?? null,
    newValue: input.event.newValue ?? null,
    actorUserId: input.event.actorUserId,
    actor: input.actor,
    ownerAtEvent: input.ownerAtEvent,
    ownerChange: input.ownerChange,
    note: input.event.note,
    createdAt: input.event.createdAt,
  };
}

function isOwnerStable(kind: WorkItemEventKind): kind is Exclude<WorkItemEventKind, 'created' | 'owner_changed'> {
  switch (kind) {
    case 'status_changed':
    case 'date_changed':
    case 'dependency_changed':
    case 'development_replied':
    case 'development_linked':
      return true;
    case 'created':
    case 'owner_changed':
      return false;
    default: {
      const unchecked: never = kind;
      return unchecked;
    }
  }
}

function actorOf(actorUserId: string, names: ReadonlyMap<string, string>): EventActor {
  if (actorUserId === '') return { presence: 'unrecorded' };
  return userParty(actorUserId, names);
}

function ownerParty(owner: RecordedOwner, names: ReadonlyMap<string, string>): EventOwner {
  if (owner.presence === 'missing') return { presence: 'unrecorded' };
  if (owner.userId === null) return { presence: 'unassigned' };
  return userParty(owner.userId, names);
}

function userParty(userId: string, names: ReadonlyMap<string, string>): EventActor {
  const name = names.get(userId);
  if (name === undefined) return { presence: 'deleted', userId };
  if (name === '') return { presence: 'named', userId, name: userId };
  return { presence: 'named', userId, name };
}

function ownerOfCreated(value: unknown): RecordedOwner {
  if (!isRecord(value) || !Object.hasOwn(value, 'ownerUserId')) return MISSING;
  return ownerOfValue(value.ownerUserId);
}

function ownerOfValue(value: unknown): RecordedOwner {
  if (value === null) return { presence: 'recorded', userId: null };
  if (typeof value === 'string' && value !== '') return { presence: 'recorded', userId: value };
  return MISSING;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectEventIds(ids: Set<string>, event: AttributableWorkItemEvent): void {
  addUserId(ids, event.actorUserId);
  if (event.kind === 'created') addOwnerId(ids, ownerOfCreated(event.newValue));
  if (event.kind === 'owner_changed') {
    addOwnerId(ids, ownerOfValue(event.oldValue));
    addOwnerId(ids, ownerOfValue(event.newValue));
  }
}

function addUserId(ids: Set<string>, userId: string): void {
  if (userId !== '') ids.add(userId);
}

function addOwnerId(ids: Set<string>, owner: RecordedOwner): void {
  if (owner.presence === 'recorded' && owner.userId !== null) ids.add(owner.userId);
}

function inHistoryOrder(events: readonly AttributableWorkItemEvent[]): readonly AttributableWorkItemEvent[] {
  return [...events].sort(byHistory);
}

function byHistory(left: AttributableWorkItemEvent, right: AttributableWorkItemEvent): number {
  if (left.createdAt < right.createdAt) return -1;
  if (left.createdAt > right.createdAt) return 1;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}
