import type { ManagementMeetingDevelopment, ManagementMeetingPeriod } from '@sw/application';
import { compareDates } from '@sw/domain';
import { isOpenWorkItemStatus } from '../../../../domain/src/entities/work-items.js';
import type { AppDatabase } from '../../client.js';
import { productDevelopmentQueries } from '../product-development/index.js';

export type LoadManagementMeetingDevelopment = (db: AppDatabase, input: ManagementMeetingPeriod) => Promise<readonly ManagementMeetingDevelopment[]>;

export const loadMeetingDevelopment: LoadManagementMeetingDevelopment = async (db, { store, weekEnd }) => {
  if (store === 'unassigned') return [];

  const queries = productDevelopmentQueries(db);
  const [projects, nodes] = await Promise.all([queries.projects(store), queries.nodes(store)]);
  const open = nodes.filter((node) =>
    node.formalLink === null && node.destination !== 'other'
    && isOpenWorkItemStatus(node.status) && compareDates(node.plannedEnd, weekEnd) <= 0,
  );
  const projectsById = new Map(projects.map((project) => [project.id, project.title]));
  const replies = await queries.replies(open.map((node) => node.id));
  const latest = new Map<string, ManagementMeetingDevelopment['latestReply']>();
  for (const reply of replies) {
    if (latest.has(reply.nodeId)) continue;
    latest.set(reply.nodeId, { text: `承诺 ${reply.promisedOn} · ${reply.evidence}`, recordedAt: reply.recordedAt });
  }
  return open.flatMap((node) => {
    const projectName = projectsById.get(node.projectId);
    if (projectName === undefined) return [];
    return [{
      id: node.id, name: node.title, projectName, plannedEnd: node.plannedEnd,
      destination: node.destination === 'finished_to_warehouse' ? 'warehouse' : 'factory',
      ownerName: node.buyerName,
      latestReply: latest.get(node.id) ?? null,
    }];
  });
};
