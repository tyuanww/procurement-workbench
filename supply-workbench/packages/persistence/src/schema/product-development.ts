import { sql } from 'drizzle-orm';
import { check, index, pgTable, text } from 'drizzle-orm/pg-core';
import { at, id } from './columns.js';
import { orderLines } from './orders.js';
import { users } from './platform.js';
import { workItems } from './work-items.js';

export const productDevelopmentProjects = pgTable('product_development_projects', {
  id: id(),
  store: text('store').notNull(),
  title: text('title').notNull(),
  productLeadUserId: text('product_lead_user_id').notNull().references(() => users.id),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: at('created_at').notNull(),
}, (table) => [
  index('product_development_projects_store_idx').on(table.store),
  check('product_development_projects_store_check', sql`${table.store} in ('dafuyan', 'yiling')`),
]);

export const productDevelopmentNodes = pgTable('product_development_nodes', {
  id: id().references(() => workItems.id),
  projectId: text('project_id').notNull().references(() => productDevelopmentProjects.id),
  destination: text('destination').notNull(),
  buyerUserId: text('buyer_user_id').references(() => users.id),
  orderLineId: text('order_line_id').references(() => orderLines.id),
  procurementLineId: text('procurement_line_id').references(() => orderLines.id),
  oaRef: text('oa_ref'),
}, (table) => [
  index('product_development_nodes_project_idx').on(table.projectId),
  check('product_development_nodes_destination_check', sql`${table.destination} in ('pilot_material_to_factory', 'packaging_to_factory', 'finished_to_warehouse', 'other')`),
  check('product_development_nodes_link_check', sql`
    (${table.orderLineId} is null and ${table.procurementLineId} is null and ${table.oaRef} is null) or
    (${table.orderLineId} is not null and ${table.procurementLineId} is not null and ${table.oaRef} is not null
      and ((${table.destination} = 'finished_to_warehouse' and ${table.orderLineId} = ${table.procurementLineId})
        or (${table.destination} in ('pilot_material_to_factory', 'packaging_to_factory') and ${table.orderLineId} <> ${table.procurementLineId})))`),
]);
