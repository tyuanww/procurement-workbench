import type { Arrival } from '@sw/application';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { at, day, id, qty } from './columns.js';

export const arrivals = pgTable('arrivals', {
  id: id(),
  registeredAt: at('registered_at').notNull(),
  registeredBy: text('registered_by').notNull(),
  source: jsonb('source').$type<Arrival['source']>().notNull(),
  warehouseId: text('warehouse_id').notNull(),
  receivedOn: day('received_on').notNull(),
  itemCode: text('item_code').notNull(),
  qty: qty('qty').notNull(),
  unit: text('unit').notNull(),
  revision: integer('revision').notNull().default(0),
  allocation: jsonb('allocation').$type<NonNullable<Arrival['allocation']>>(),
}, (table) => [
  check('arrivals_qty_check', sql`${table.qty} > 0`),
  check('arrivals_revision_check', sql`${table.revision} >= 0`),
  index('arrivals_received_on_idx').on(table.receivedOn.desc(), table.id.desc()),
  index('arrivals_pending_idx').on(table.receivedOn.desc(), table.id.desc()).where(sql`${table.allocation} IS NULL`),
]);

export const arrivalReferences = pgTable('arrival_references', {
  key: text('key').primaryKey(),
  arrivalId: text('arrival_id').notNull(),
});

export const arrivalRevisions = pgTable('arrival_revisions', {
  arrivalId: text('arrival_id').notNull().references(() => arrivals.id),
  revision: integer('revision').notNull(),
  requestKey: text('request_key').notNull(),
}, (table) => [
  primaryKey({ columns: [table.arrivalId, table.revision] }),
  check('arrival_revisions_revision_check', sql`${table.revision} > 0`),
]);
