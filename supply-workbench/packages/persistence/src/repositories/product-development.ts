import { eq } from 'drizzle-orm';
import { DEVELOPMENT_DESTINATIONS, PRODUCT_DEVELOPMENT_STORES } from '@sw/domain';
import type { DevelopmentProject, DevelopmentNode, DevelopmentUnitOfWork } from '@sw/application';
import { NotFoundError } from '@sw/application/errors';
import type { AppDatabase } from '../client.js';
import { entityId, entityIdOrNull, orderLineId } from '../mappers/id.js';
import { instant } from '../mappers/time.js';
import { oneOf } from '../queries/follow-up/guards.js';
import { isDevelopmentMaterial, validDevelopmentOrder } from '../queries/product-development/orders.js';
import { requireDatabase } from '../require-database.js';
import { productDevelopmentNodes, productDevelopmentProjects } from '../schema/product-development.js';
import { workItemEvents } from '../schema/work-items.js';
import { createUnitOfWork } from '../unit-of-work.js';
import { auditRepository } from './audit-log.js';
import { placeholderStores } from './index.js';
import { toEvent, workItemEventRepository, workItemRepository } from './plan/work-items.js';
import { userRepository } from './users.js';

export function productDevelopmentUnitOfWork(db: AppDatabase): DevelopmentUnitOfWork {
  return createUnitOfWork(db, (raw) => {
    const tx = requireDatabase(raw);
    return {
      ...placeholderStores(),
      development: developmentRepository(tx),
      workItems: workItemRepository(tx),
      workItemEvents: workItemEventRepository(tx),
      audit: auditRepository(tx),
      users: userRepository(tx),
    };
  });
}

function developmentRepository(db: AppDatabase) {
  return {
    async insertProject(project: DevelopmentProject) {
      const rows = await db.insert(productDevelopmentProjects).values(project).onConflictDoNothing().returning();
      return rows.length === 1;
    },
    async lockProject(id: string) {
      const [row] = await db.select().from(productDevelopmentProjects).where(eq(productDevelopmentProjects.id, id)).for('update');
      if (row === undefined) throw new NotFoundError('新品项目', id);
      return developmentProjectOf(row);
    },
    async findNode(id: string) {
      const [row] = await db.select().from(productDevelopmentNodes).where(eq(productDevelopmentNodes.id, id));
      return row === undefined ? undefined : developmentNodeOf(row);
    },
    async insertNode(node: DevelopmentNode) {
      await db.insert(productDevelopmentNodes).values(nodeRow(node));
    },
    async updateNode(node: DevelopmentNode) {
      await db.update(productDevelopmentNodes).set(nodeRow(node)).where(eq(productDevelopmentNodes.id, node.id));
    },
    async event(id: string) {
      const [row] = await db.select().from(workItemEvents).where(eq(workItemEvents.id, id));
      return row === undefined ? undefined : toEvent(row);
    },
    validOrder: (input: Parameters<typeof validDevelopmentOrder>[1]) => validDevelopmentOrder(db, input),
    isMaterial: (input: Parameters<typeof isDevelopmentMaterial>[1]) => isDevelopmentMaterial(db, input),
  };
}

export function developmentProjectOf(row: typeof productDevelopmentProjects.$inferSelect): DevelopmentProject {
  return { ...row, id: entityId(row.id), store: oneOf(PRODUCT_DEVELOPMENT_STORES, row.store), productLeadUserId: entityId(row.productLeadUserId),
    createdBy: entityId(row.createdBy), createdAt: instant(row.createdAt) };
}

export function developmentNodeOf(row: typeof productDevelopmentNodes.$inferSelect): DevelopmentNode {
  const { orderLineId: orderId, procurementLineId, oaRef } = row;
  const formalLink = orderId === null || procurementLineId === null || oaRef === null ? null :
    { orderLineId: orderLineId(orderId), procurementLineId: orderLineId(procurementLineId), oaRef };
  return { id: entityId(row.id), projectId: entityId(row.projectId), destination: oneOf(DEVELOPMENT_DESTINATIONS, row.destination),
    buyerUserId: entityIdOrNull(row.buyerUserId), formalLink };
}

function nodeRow(node: DevelopmentNode): typeof productDevelopmentNodes.$inferInsert {
  return { id: node.id, projectId: node.projectId, destination: node.destination, buyerUserId: node.buyerUserId,
    orderLineId: node.formalLink?.orderLineId ?? null, procurementLineId: node.formalLink?.procurementLineId ?? null, oaRef: node.formalLink?.oaRef ?? null };
}
