import { eq, inArray } from 'drizzle-orm';
import type { LineTimeline, TimelineEvent } from '@sw/application';
import { ValidationFailedError } from '@sw/application/errors';
import { BATCH_STATUSES, DATE_CHANGE_FIELDS, EXCEPTION_STATUSES, EXCEPTION_TYPES, FOLLOW_UP_KINDS, NOTE_STATUSES, localDate } from '@sw/domain';
import type { AppDatabase } from '../../client.js';
import { instant } from '../../mappers/time.js';
import { numberOrNull } from '../../mappers/number.js';
import { users } from '../../schema/platform.js';
import { batchDateChanges, deliveryBatches, deliveryNotes, exceptions, followUps, receipts, shipments } from '../../schema/orders.js';
import { oneOf } from './guards.js';

const PAGE_SIZE = 50;
const SEP = '\u001f';

type Event = TimelineEvent;

export async function lineTimeline({ db, lineId, cursor }: { readonly db: AppDatabase; readonly lineId: string; readonly cursor?: string | undefined }): Promise<LineTimeline> {
  const events = await eventsOf(db, lineId);
  const start = cursor === undefined ? 0 : indexAfter(events, cursor);
  const page = events.slice(start, start + PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor = start + PAGE_SIZE < events.length && last !== undefined ? cursorOf(last) : null;
  return { events: page, nextCursor };
}

async function eventsOf(db: AppDatabase, lineId: string): Promise<Event[]> {
  const names = await nameMap(db);
  const batches = await db.select().from(deliveryBatches).where(eq(deliveryBatches.orderLineId, lineId));
  const [batchEvents, notes] = await Promise.all([eventsOfBatches({ db, batches, names }), lineNotes({ db, lineId, names })]);
  return [...batchEvents, ...notes].sort(byTime);
}

async function nameMap(db: AppDatabase): Promise<Map<string, string>> {
  const userRows = await db.select().from(users);
  return new Map(userRows.map((row) => [row.id, row.name]));
}

async function eventsOfBatches({ db, batches, names }: { readonly db: AppDatabase; readonly batches: readonly (typeof deliveryBatches.$inferSelect)[]; readonly names: ReadonlyMap<string, string> }): Promise<Event[]> {
  const ids = batches.map((row) => row.id);
  if (ids.length === 0) return [];
  const [changes, shipped, received, notes] = await Promise.all([
    db.select().from(batchDateChanges).where(inArray(batchDateChanges.batchId, ids)),
    db.select().from(shipments).where(inArray(shipments.batchId, ids)),
    db.select().from(receipts).where(inArray(receipts.batchId, ids)),
    db.select().from(deliveryNotes).where(inArray(deliveryNotes.batchId, ids)),
  ]);
  return [
    ...batches.map((row) => statusEvent(row)),
    ...changes.map((row) => changeEvent(row, names)),
    ...shipped.map((row) => shipmentEvent(row, names)),
    ...received.map((row) => receiptEvent(row, names)),
    ...notes.flatMap((row) => noteEvent(row, names)),
  ];
}

async function lineNotes({ db, lineId, names }: { readonly db: AppDatabase; readonly lineId: string; readonly names: ReadonlyMap<string, string> }): Promise<Event[]> {
  const [followed, opened] = await Promise.all([
    db.select().from(followUps).where(eq(followUps.orderLineId, lineId)),
    db.select().from(exceptions).where(eq(exceptions.orderLineId, lineId)),
  ]);
  return [...followed.map((row) => followEvent(row, names)), ...opened.map((row) => exceptionEvent(row, names))];
}

function followEvent(row: typeof followUps.$inferSelect, names: ReadonlyMap<string, string>): Event {
  return { id: row.id, at: instant(row.createdAt), actor: actorOf(row.createdBy, names), voided: false, kind: 'follow_up', followUpKind: oneOf(FOLLOW_UP_KINDS, row.kind), text: row.text, batchId: row.batchId };
}

function exceptionEvent(row: typeof exceptions.$inferSelect, names: ReadonlyMap<string, string>): Event {
  return { id: row.id, at: instant(row.createdAt), actor: actorOf(row.openedBy, names), voided: false, kind: 'exception', exceptionType: oneOf(EXCEPTION_TYPES, row.type), note: row.note, status: oneOf(EXCEPTION_STATUSES, row.status), batchId: row.batchId };
}

function statusEvent(row: typeof deliveryBatches.$inferSelect): Event {
  return { id: `status:${row.id}`, at: instant(row.statusChangedAt), actor: null, voided: false, kind: 'status_change', status: oneOf(BATCH_STATUSES, row.status) };
}

function changeEvent(row: typeof batchDateChanges.$inferSelect, names: ReadonlyMap<string, string>): Event {
  return { id: row.id, at: instant(row.changedAt), actor: actorOf(row.changedBy, names), voided: false, kind: 'date_change', field: oneOf(DATE_CHANGE_FIELDS, row.field), oldValue: dayOrNull(row.oldValue), newValue: dayOrNull(row.newValue), reason: row.reason };
}

function shipmentEvent(row: typeof shipments.$inferSelect, names: ReadonlyMap<string, string>): Event {
  return { id: row.id, at: instant(row.createdAt), actor: actorOf(row.createdBy, names), voided: row.voidedAt !== null, kind: 'shipment', qty: numberOrNull(row.qty) ?? missingQty(row.id), shippedOn: localDate(row.shippedOn), fulfillment: row.fulfillment };
}

function receiptEvent(row: typeof receipts.$inferSelect, names: ReadonlyMap<string, string>): Event {
  return { id: row.id, at: instant(row.createdAt), actor: actorOf(row.createdBy, names), voided: row.voidedAt !== null, kind: 'receipt', qty: numberOrNull(row.qty) ?? missingQty(row.id), receivedOn: localDate(row.receivedOn), fulfillment: row.fulfillment };
}

function noteEvent(row: typeof deliveryNotes.$inferSelect, names: ReadonlyMap<string, string>): Event[] {
  const status = oneOf(NOTE_STATUSES, row.status);
  if (status === 'missing') return [];
  return [{ id: row.id, at: instant(row.createdAt), actor: actorOf(row.createdBy, names), voided: row.voidedAt !== null, kind: 'delivery_note', status }];
}

function actorOf(userId: string | null, names: ReadonlyMap<string, string>): Event['actor'] {
  if (userId === null) return null;
  const name = names.get(userId);
  return name === undefined ? null : { id: userId, name };
}

function dayOrNull(value: string | null) {
  return value === null ? null : localDate(value);
}

function missingQty(id: string): never {
  throw new Error(`记录 ${id} 的数量缺失`);
}

function byTime(left: Event, right: Event): number {
  const at = right.at.localeCompare(left.at);
  return at === 0 ? right.id.localeCompare(left.id) : at;
}

function indexAfter(events: readonly Event[], cursor: string): number {
  const parts = cursorParts(cursor);
  const index = events.findIndex((event) => event.at === parts.at && event.id === parts.id);
  if (index >= 0) return index + 1;
  const older = events.findIndex((event) => event.at < parts.at || (event.at === parts.at && event.id < parts.id));
  return older < 0 ? events.length : older;
}

function cursorParts(cursor: string): { readonly at: string; readonly id: string } {
  const text = decode(cursor);
  const index = text?.indexOf(SEP) ?? -1;
  if (text === undefined || index < 1) throw new ValidationFailedError('时间线游标不合法', { field: 'cursor' });
  return { at: text.slice(0, index), id: text.slice(index + SEP.length) };
}

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
}

function cursorOf(event: Event): string {
  return encodeURIComponent(`${event.at}${SEP}${event.id}`);
}

export function timelinePageSize(): number {
  return PAGE_SIZE;
}
