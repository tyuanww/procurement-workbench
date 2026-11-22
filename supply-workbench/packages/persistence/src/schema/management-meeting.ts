import type { ManagementMeetingStore } from '@sw/application';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { at, day, id } from './columns.js';
import { orderLines } from './orders.js';
import { users } from './platform.js';

export const managementMeetingDecisions = pgTable('management_meeting_decisions', {
  id: id(),
  store: text('store').$type<ManagementMeetingStore>().notNull(),
  weekStart: day('week_start').notNull(),
  materialLineId: text('material_line_id').notNull().references(() => orderLines.id),
  decision: text('decision').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  ownerName: text('owner_name').notNull(),
  dueDate: day('due_date').notNull(),
  completionCriteria: text('completion_criteria').notNull(),
  recordedAt: at('recorded_at').notNull(),
  decidedById: text('decided_by_id').notNull().references(() => users.id),
  decidedByName: text('decided_by_name').notNull(),
  completionEvidence: text('completion_evidence'),
  completedAt: at('completed_at'),
  completedById: text('completed_by_id').references(() => users.id),
  completedByName: text('completed_by_name'),
});
