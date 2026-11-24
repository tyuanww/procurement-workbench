import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { LatestNote } from '@sw/application';
import type { AppDatabase } from '../../client.js';
import { followUps } from '../../schema/orders.js';

type NoteRow = {
  readonly orderLineId: string;
  readonly text: string;
  readonly createdAt: string;
  readonly id: string;
};

export async function latestNotes(db: AppDatabase, orderLineIds: readonly string[]): Promise<LatestNote[]> {
  const ids = [...new Set(orderLineIds)];
  if (ids.length === 0) return [];
  const rows = await db
    .select({ orderLineId: followUps.orderLineId, text: followUps.text, createdAt: followUps.createdAt, id: followUps.id })
    .from(followUps)
    .where(and(eq(followUps.kind, 'note'), isNull(followUps.batchId), inArray(followUps.orderLineId, ids)));
  return pickLatest(rows);
}

function pickLatest(rows: readonly NoteRow[]): LatestNote[] {
  const best = new Map<string, NoteRow>();
  for (const row of rows) {
    const current = best.get(row.orderLineId);
    if (current === undefined || isNewer(row, current)) best.set(row.orderLineId, row);
  }
  return [...best.values()].map(noteOf);
}

function isNewer(row: NoteRow, current: NoteRow): boolean {
  if (row.createdAt === current.createdAt) return row.id > current.id;
  return row.createdAt > current.createdAt;
}

function noteOf(row: NoteRow): LatestNote {
  return { orderLineId: row.orderLineId, text: row.text };
}
