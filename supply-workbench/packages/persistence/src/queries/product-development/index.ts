import { asc, desc, eq, inArray, and, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ROLES, can, localDate, type EntityId } from '@sw/domain';
import { canLeadDevelopment, developmentReplyDate, isDevelopmentBuyer, type DevelopmentQueries, type DevelopmentScope } from '@sw/application';
import type { AppDatabase } from '../../client.js';
import { entityId, entityIdOrNull } from '../../mappers/id.js';
import { instant } from '../../mappers/time.js';
import { developmentNodeOf, developmentProjectOf } from '../../repositories/product-development.js';
import { users } from '../../schema/platform.js';
import { productDevelopmentNodes, productDevelopmentProjects } from '../../schema/product-development.js';
import { workItemEvents, workItems } from '../../schema/work-items.js';
import { WORK_ITEM_STATUSES } from '../../../../domain/src/entities/work-items.js';
import { oneOf } from '../follow-up/guards.js';
import { developmentBatches } from './fulfillment.js';
import { developmentMaterialOptions, developmentOrderOptions } from './orders.js';

const assignedBuyer = alias(users, 'assigned_buyer');

export function productDevelopmentQueries(db: AppDatabase): DevelopmentQueries {
  return {
    projects: (store) => projectsOf(db, store),
    nodes: (store) => nodesOf(db, store),
    replies: (nodeIds) => repliesOf(db, nodeIds),
    batches: (lineIds, includeReceiptDates) => developmentBatches(db, { lineIds, includeReceiptDates }),
    orders: (input) => developmentOrderOptions(db, input),
    materials: (input) => developmentMaterialOptions(db, input),
    users: () => developmentUsers(db),
  };
}

async function projectsOf(db: AppDatabase, store: DevelopmentScope) {
  const rows = await db.select({ project: productDevelopmentProjects, name: users.name }).from(productDevelopmentProjects)
    .leftJoin(users, eq(users.id, productDevelopmentProjects.productLeadUserId))
    .where(scopeOf(store))
    .orderBy(desc(productDevelopmentProjects.createdAt), asc(productDevelopmentProjects.id));
  return rows.map(({ project, name }) => ({ ...developmentProjectOf(project), productLeadName: name }));
}

async function nodesOf(db: AppDatabase, store: DevelopmentScope) {
  const rows = await db.select({ node: productDevelopmentNodes, item: workItems, ownerName: users.name, buyerName: assignedBuyer.name })
    .from(productDevelopmentNodes)
    .innerJoin(productDevelopmentProjects, eq(productDevelopmentNodes.projectId, productDevelopmentProjects.id))
    .innerJoin(workItems, eq(productDevelopmentNodes.id, workItems.id))
    .leftJoin(users, eq(users.id, workItems.ownerUserId))
    .leftJoin(assignedBuyer, eq(assignedBuyer.id, productDevelopmentNodes.buyerUserId))
    .where(scopeOf(store))
    .orderBy(asc(workItems.plannedStart), asc(workItems.plannedEnd), asc(workItems.title), asc(workItems.id));
  return rows.map(({ node, item, ownerName, buyerName }) => ({
    ...developmentNodeOf(node), title: item.title, plannedStart: localDate(item.plannedStart), plannedEnd: localDate(item.plannedEnd),
    status: oneOf(WORK_ITEM_STATUSES, item.status), version: item.version, ownerUserId: entityIdOrNull(item.ownerUserId), ownerName, buyerName,
  }));
}

async function repliesOf(db: AppDatabase, nodeIds: readonly EntityId[]) {
  if (nodeIds.length === 0) return [];
  const rows = await db.select({ event: workItemEvents, actorName: users.name }).from(workItemEvents)
    .leftJoin(users, eq(users.id, workItemEvents.actorUserId))
    .where(and(eq(workItemEvents.kind, 'development_replied'), inArray(workItemEvents.workItemId, [...nodeIds])))
    .orderBy(desc(workItemEvents.createdAt), sql`(${workItemEvents.newValue}->>'version')::integer desc nulls last`, desc(workItemEvents.id));
  return rows.map(({ event, actorName }) => {
    const promisedOn = developmentReplyDate(event.newValue);
    if (promisedOn === undefined || event.note === null) throw new Error('新品采购回复缺少日期或凭据');
    return { id: entityId(event.id), nodeId: entityId(event.workItemId), promisedOn: localDate(promisedOn), evidence: event.note,
      recordedAt: instant(event.createdAt), actorUserId: entityId(event.actorUserId), actorName };
  });
}

async function developmentUsers(db: AppDatabase) {
  const rows = await db.select({ id: users.id, name: users.name, roles: users.roles }).from(users)
    .where(eq(users.active, true)).orderBy(asc(users.name), asc(users.id));
  return rows.flatMap((row) => {
    const actor = { id: entityId(row.id), name: row.name, roles: ROLES.filter((role) => row.roles.includes(role)) };
    return can(actor, 'plan.read') ? [{ id: actor.id, name: actor.name, canLead: canLeadDevelopment(actor), canBuy: isDevelopmentBuyer(actor) }] : [];
  });
}

function scopeOf(store: DevelopmentScope) {
  return store === 'all' ? undefined : eq(productDevelopmentProjects.store, store);
}
