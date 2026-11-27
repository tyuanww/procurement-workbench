import { can, diffDays, type ProductDevelopmentStore } from '@sw/domain';
import { isOpenWorkItemStatus } from '../../../domain/src/entities/work-items.js';
import type { Clock } from '../ports/clock.js';
import type { DevelopmentQueries, DevelopmentScope } from '../ports/product-development.js';
import type { Actor } from '../shared/actor.js';
import { authorize } from '../shared/authorize.js';
import { canManageDevelopment, requireDevelopmentManagement } from './access.js';
import { canReplyToDevelopment } from './state.js';
import type { ProductDevelopmentView } from './views.js';

export function makeProductDevelopmentRead({ queries, clock }: { readonly queries: DevelopmentQueries; readonly clock: Clock }) {
  return {
    list: (input: { readonly store: DevelopmentScope; readonly includeReceiptDates: boolean }, actor: Actor) =>
      list({ ...input, actor, queries, clock }),
    orders: async (input: Parameters<DevelopmentQueries['orders']>[0], actor: Actor) => {
      authorize(actor, 'plan.read');
      await requireStoreManagement({ store: input.store, actor, queries });
      return queries.orders(input);
    },
    materials: async (input: Parameters<DevelopmentQueries['materials']>[0], actor: Actor) => {
      authorize(actor, 'plan.read');
      await requireStoreManagement({ store: input.store, actor, queries });
      return queries.materials(input);
    },
  };
}

async function list({ actor, store, queries, clock, includeReceiptDates }: {
  readonly actor: Actor; readonly store: DevelopmentScope; readonly queries: DevelopmentQueries; readonly clock: Clock;
  readonly includeReceiptDates: boolean;
}): Promise<ProductDevelopmentView> {
  authorize(actor, 'plan.read');
  const businessDate = clock.today();
  const [projects, nodes] = await Promise.all([queries.projects(store), queries.nodes(store)]);
  const canCreateProject = can(actor, 'products.maintain');
  const canSeeUsers = canCreateProject || projects.some((project) => canManageDevelopment(project, actor));
  const [replies, batches, users] = await Promise.all([
    queries.replies(nodes.map((node) => node.id)),
    queries.batches([...new Set(nodes.flatMap((node) => node.formalLink === null ? [] : [node.formalLink.procurementLineId]))], includeReceiptDates),
    canSeeUsers ? queries.users() : [],
  ]);
  const byNode = groupBy(replies, (reply) => reply.nodeId);
  const byProject = groupBy(nodes, (node) => node.projectId);
  return {
    businessDate, canCreateProject, users,
    projects: projects.map(({ progressVersion, ...project }) => ({
      ...project,
      ...(project.progress === undefined ? {} : { progressVersion }),
      canManage: canManageDevelopment(project, actor),
      nodes: (byProject.get(project.id) ?? []).map((node) => {
        const replyHistory = byNode.get(node.id) ?? [];
        return {
          ...node,
          daysUntilRequired: isOpenWorkItemStatus(node.status) ? diffDays(node.plannedEnd, businessDate) : null,
          canReply: canReplyToDevelopment(node, actor),
          latestReply: replyHistory[0] ?? null,
          replies: replyHistory,
          batches: node.formalLink === null ? [] : batches.get(node.formalLink.procurementLineId) ?? [],
        };
      }),
    })),
  };
}

async function requireStoreManagement({ store, actor, queries }: { readonly store: ProductDevelopmentStore; readonly actor: Actor; readonly queries: DevelopmentQueries }): Promise<void> {
  const projects = await queries.projects(store);
  if (projects.some((project) => canManageDevelopment(project, actor))) return;
  const first = projects[0];
  if (first !== undefined) requireDevelopmentManagement(first, actor);
  authorize(actor, 'products.maintain');
}

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const items = groups.get(key) ?? [];
    items.push(row);
    groups.set(key, items);
  }
  return groups;
}
