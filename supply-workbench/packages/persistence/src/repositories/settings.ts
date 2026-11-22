import { and, eq, sql } from 'drizzle-orm';
import { DEFAULT_SETTINGS, localDate, type Settings } from '@sw/domain';
import type { SettingsRepository } from '../../../application/src/ports/settings-repository.js';
import type { AppDatabase } from '../client.js';
import { settings } from '../schema/platform.js';
import { entityIdOrNull } from '../mappers/id.js';

const SETTINGS_ID = 'default';

export function settingsRepository(db: AppDatabase): SettingsRepository {
  return {
    async get() {
      const row = (await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)))[0];
      return row === undefined ? DEFAULT_SETTINGS : toSettings(row);
    },
    async save(entity) {
      const row = { id: SETTINGS_ID, ...entity };
      await db.insert(settings).values(row).onConflictDoUpdate({ target: settings.id, set: row });
    },
    async saveConditional(entity, expected) {
      const row = { id: SETTINGS_ID, ...entity };
      const current = { id: SETTINGS_ID, ...expected };
      const inserted = await db.insert(settings).values(row).onConflictDoNothing().returning();
      if (inserted.length === 1) return true;
      const updated = await db.update(settings)
        .set(row)
        .where(and(
          eq(settings.id, SETTINGS_ID),
          eq(settings.upcomingDays, current.upcomingDays),
          nullableNumber(settings.shippedNotReceivedAlertDays, current.shippedNotReceivedAlertDays),
          nullableNumber(settings.deliveryNoteAlertDays, current.deliveryNoteAlertDays),
          eq(settings.missingDateHintWindowDays, current.missingDateHintWindowDays),
          sql`${settings.dateSanityRange} = ${JSON.stringify({ from: current.dateSanityRange.from, to: current.dateSanityRange.to })}::jsonb`,
          nullableText(settings.ownWarehousePartyId, current.ownWarehousePartyId),
        ))
        .returning();
      return updated.length === 1;
    },
  };
}

function nullableNumber(column: unknown, value: number | null) {
  return value === null ? sql`${column} IS NULL` : sql`${column} = ${value}`;
}

function nullableText(column: unknown, value: string | null) {
  return value === null ? sql`${column} IS NULL` : sql`${column} = ${value}`;
}

function toSettings(row: typeof settings.$inferSelect): Settings {
  return {
    upcomingDays: row.upcomingDays,
    shippedNotReceivedAlertDays: row.shippedNotReceivedAlertDays,
    deliveryNoteAlertDays: row.deliveryNoteAlertDays,
    missingDateHintWindowDays: row.missingDateHintWindowDays,
    dateSanityRange: rangeOf(row.dateSanityRange),
    ownWarehousePartyId: entityIdOrNull(row.ownWarehousePartyId),
  };
}

function rangeOf(value: unknown): Settings['dateSanityRange'] {
  if (typeof value === 'object' && value !== null && 'from' in value && 'to' in value) {
    const from = value.from;
    const to = value.to;
    if (typeof from === 'string' && typeof to === 'string') return { from: localDate(from), to: localDate(to) };
  }
  return DEFAULT_SETTINGS.dateSanityRange;
}
