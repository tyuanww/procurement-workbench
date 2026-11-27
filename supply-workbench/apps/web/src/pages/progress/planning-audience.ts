import type { ProcurementStore, ProductDevelopment } from '@sw/contracts';
import type { PlanningGroup } from './planning-rows.js';

export function developmentAudience(data: ProductDevelopment | null, { actorId, canOversee, canLeadProduct }: {
  readonly actorId: string | undefined; readonly canOversee: boolean; readonly canLeadProduct?: boolean;
}) {
  if (canOversee) return 'management';
  return actorId !== undefined && (canLeadProduct || data?.projects.some((project) => project.productLeadUserId === actorId)) ? 'mine' : 'shared';
}

export function scopedDevelopment(data: ProductDevelopment | null, { store, actorId }: {
  readonly store: ProcurementStore; readonly actorId: string | undefined;
}): ProductDevelopment | null {
  if (data === null || store === 'unassigned') return null;
  if (store === 'all' && actorId === undefined) return data;
  return { ...data, projects: data.projects.filter((project) =>
    (store === 'all' || project.store === store) && (actorId === undefined || project.productLeadUserId === actorId
      || project.canManage || project.nodes.some((node) => node.canReply))) };
}

export function groupByProductLead(groups: readonly PlanningGroup[], riskOnly: boolean): readonly PlanningGroup[] {
  const byLead = new Map<string, { name: string; projects: { group: PlanningGroup; risks: number }[] }>();
  for (const group of groups) {
    const source = group.rows.find((row) => row.source.kind === 'development')?.source;
    const project = source?.kind === 'development' ? source.project : group.project;
    if (project === undefined) continue;
    const risks = group.rows.filter((row) => row.source.kind === 'development' && row.risk !== undefined).length;
    if (riskOnly && risks === 0) continue;
    const lead = byLead.get(project.productLeadUserId) ?? { name: project.productLeadName ?? '项目对接人待核对', projects: [] };
    lead.projects.push({ group, risks });
    byLead.set(project.productLeadUserId, lead);
  }
  const managers = [...byLead.values()].map((lead) => ({
    ...lead, risks: lead.projects.reduce((sum, project) => sum + project.risks, 0),
  })).sort((left, right) => right.risks - left.risks || left.name.localeCompare(right.name, 'zh-CN'));
  return managers.flatMap(({ name, projects, risks }) => projects.map(({ group, risks: projectRisks }, index) => ({
    ...group,
    meta: [group.meta, `${projectRisks} 个风险节点`].filter(Boolean).join(' · '),
    ...(index === 0 ? { leadHeading: `${name} · ${projects.length} 个项目 · ${risks} 个风险节点` } : {}),
  })));
}
