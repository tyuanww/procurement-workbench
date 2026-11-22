import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { at, day, id, timestamps } from './columns.js';

export const workItems = pgTable(
  'work_items',
  {
    id: id(),
    ...timestamps,
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id'),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    ownerUserId: text('owner_user_id'),
    counterpartyPartyId: text('counterparty_party_id'),
    counterpartyRole: text('counterparty_role'),
    plannedStart: day('planned_start').notNull(),
    plannedEnd: day('planned_end').notNull(),
    status: text('status').notNull(),
    priority: text('priority').notNull(),
    source: text('source').notNull(),
    parentId: text('parent_id'),
    version: integer('version').notNull().default(0),
  },
  (table) => [
    check('work_items_subject_type_check', sql`${table.subjectType} in ('order_line', 'delivery_batch', 'standalone', 'product_development')`),
    check('work_items_kind_check', sql`${table.kind} in ('milestone', 'task', 'follow_up')`),
    check('work_items_status_check', sql`${table.status} in ('planned', 'in_progress', 'blocked', 'done', 'cancelled')`),
    check('work_items_priority_check', sql`${table.priority} in ('low', 'normal', 'high', 'urgent')`),
    check('work_items_source_check', sql`${table.source} in ('manual', 'batch_milestone', 'import')`),
    check('work_items_counterparty_role_check', sql`${table.counterpartyRole} is null or ${table.counterpartyRole} in ('supplier', 'factory', 'customer', 'internal', 'other')`),
    check('work_items_planned_range_check', sql`${table.plannedEnd} >= ${table.plannedStart}`),
    index('work_items_status_planned_end_idx').on(table.status, table.plannedEnd),
    index('work_items_planned_seq_idx').on(table.plannedEnd),
    index('work_items_owner_planned_end_idx').on(table.ownerUserId, table.plannedEnd),
    index('work_items_counterparty_planned_end_idx').on(table.counterpartyPartyId, table.plannedEnd),
    index('work_items_subject_idx').on(table.subjectType, table.subjectId),
  ],
);

export const workItemEvents = pgTable(
  'work_item_events',
  {
    id: id(),
    workItemId: text('work_item_id').notNull(),
    kind: text('kind').notNull(),
    field: text('field'),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    actorUserId: text('actor_user_id').notNull(),
    note: text('note'),
    createdAt: at('created_at').notNull(),
  },
  (table) => [
    check('work_item_events_kind_check', sql`${table.kind} in ('created', 'status_changed', 'owner_changed', 'date_changed', 'dependency_changed', 'development_replied', 'development_linked')`),
    index('work_item_events_work_item_created_idx').on(table.workItemId, table.createdAt),
  ],
);

export const workItemDependencies = pgTable(
  'work_item_dependencies',
  {
    id: id(),
    fromItemId: text('from_item_id').notNull(),
    toItemId: text('to_item_id').notNull(),
    kind: text('kind').notNull(),
    createdAt: at('created_at').notNull(),
  },
  (table) => [
    check('work_item_dependencies_kind_check', sql`${table.kind} in ('finish_to_start')`),
    check('work_item_dependencies_not_self_check', sql`${table.fromItemId} <> ${table.toItemId}`),
    uniqueIndex('work_item_dependencies_pair_uq').on(table.fromItemId, table.toItemId, table.kind),
    index('work_item_dependencies_to_idx').on(table.toItemId),
    index('work_item_dependencies_from_idx').on(table.fromItemId),
  ],
);
