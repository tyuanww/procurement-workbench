import { date, numeric, timestamp, text } from 'drizzle-orm/pg-core';

export function id() {
  return text('id').primaryKey();
}

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
};

export function qty(name: string) {
  return numeric(name, { precision: 18, scale: 4 });
}

export function day(name: string) {
  return date(name, { mode: 'string' });
}

export function at(name: string) {
  return timestamp(name, { withTimezone: true, mode: 'string' });
}
