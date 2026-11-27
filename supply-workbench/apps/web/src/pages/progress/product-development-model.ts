import { WorkItemStatusSchema, type ProductDevelopmentNode, type ProductDevelopmentProject } from '@sw/contracts';
import { addDays, isOpenWorkItemStatus, parseLocalDate, type LocalDate } from '@sw/domain';
import { readScheduleQuery, scheduleWindow, type ScheduleWindow } from '../../features/progress/index.js';
import { developmentRiskOf, nodeWaitingText } from './product-development-forecast.js';

export const DEVELOPMENT_WINDOW_DAYS = 14;
const DEVELOPMENT_EARLIEST_START = '0001-01-01';
const DEVELOPMENT_LATEST_START = '9999-12-18';

export type DevelopmentPeriod = (ScheduleWindow & { readonly kind: 'rolling' })
  | (ScheduleWindow & { readonly kind: 'month' });

export function readDevelopmentPeriod(params: URLSearchParams, today: LocalDate): DevelopmentPeriod {
  const previous = readScheduleQuery(params.toString(), today);
  const view = params.get('developmentPeriod');
  if (view === 'month' || (view === null && previous.scale === 'month')) {
    const month = params.get('developmentMonth');
    const date = parseLocalDate(`${month ?? previous.anchor.slice(0, 7)}-01`);
    return { kind: 'month', ...scheduleWindow({ scale: 'month', anchor: date.ok ? date.value : today }) };
  }
  const from = developmentRollingStart(params.get('developmentFrom')) ?? today;
  return { kind: 'rolling', from, to: addDays(from, DEVELOPMENT_WINDOW_DAYS - 1) };
}

export function developmentRollingStart(raw: string | null): LocalDate | null {
  const date = parseLocalDate(raw ?? '');
  return date.ok && date.value >= DEVELOPMENT_EARLIEST_START && date.value <= DEVELOPMENT_LATEST_START ? date.value : null;
}

export function readDevelopmentFilters(params: URLSearchParams) {
  return {
    keyword: params.get('planSearch')?.trim().slice(0, 120) ?? '',
    productLead: params.get('developmentLead'),
    nodeOwner: params.get('ownerUserId'),
    status: WorkItemStatusSchema.safeParse(params.get('status')).data,
    isRiskOnly: params.get('planRiskOnly') === '1',
  };
}

export type DevelopmentFilters = ReturnType<typeof readDevelopmentFilters>;

export function hasDevelopmentFilters(filters: DevelopmentFilters): boolean {
  return filters.keyword !== '' || filters.productLead !== null || filters.nodeOwner !== null
    || filters.status !== undefined || filters.isRiskOnly;
}

export type DevelopmentNodeView = {
  readonly project: ProductDevelopmentProject;
  readonly node: ProductDevelopmentNode;
  readonly risk: string | null;
  readonly waiting: string | null;
  readonly placement: 'in-period' | 'carry' | 'outside';
};

export type DevelopmentProjectView = {
  readonly project: ProductDevelopmentProject;
  readonly nodes: readonly DevelopmentNodeView[];
  readonly milestones: readonly DevelopmentNodeView[];
  readonly next: DevelopmentNodeView | undefined;
  readonly riskCount: number;
  readonly firstRisk: DevelopmentNodeView | undefined;
};

export function developmentProjects({ projects, period, filters }: {
  readonly projects: readonly ProductDevelopmentProject[];
  readonly period: DevelopmentPeriod;
  readonly filters: DevelopmentFilters;
}): readonly DevelopmentProjectView[] {
  return projects.map((project) => developmentProject({ project, period, filters }));
}

function developmentProject({ project, period, filters }: {
  readonly project: ProductDevelopmentProject;
  readonly period: DevelopmentPeriod;
  readonly filters: DevelopmentFilters;
}): DevelopmentProjectView {
  const nodes = project.nodes.filter((node) => matchesNode({ project, node, filters }))
    .map((node): DevelopmentNodeView => {
      const risk = developmentRiskOf(node);
      return { project, node, risk, waiting: nodeWaitingText(node), placement: nodePlacement({ node, period, risk }) };
    }).sort(compareMilestones);
  const milestones = nodes.filter(({ placement }) => placement !== 'outside');
  const risks = milestones.filter(({ risk }) => risk !== null);
  const next = milestones.find(({ node, placement }) => placement === 'in-period'
    && node.status !== 'done' && node.status !== 'cancelled' && (node.daysUntilRequired ?? 0) >= 0);
  const firstRisk = risks.find(({ placement }) => placement === 'carry') ?? risks[0];
  return { project, nodes, milestones, next, riskCount: risks.length, firstRisk };
}

function nodePlacement({ node, period, risk }: Pick<DevelopmentNodeView, 'node' | 'risk'> & { readonly period: DevelopmentPeriod }): DevelopmentNodeView['placement'] {
  if (node.plannedEnd >= period.from && node.plannedEnd <= period.to) return 'in-period';
  if (node.status === 'blocked' || (risk !== null && !isOpenWorkItemStatus(node.status)) || (node.daysUntilRequired !== null && node.daysUntilRequired < 0)) return 'carry';
  if (overlapsRollingPeriod(node, period)) return 'in-period';
  return isOpenWaiting(node) ? 'carry' : 'outside';
}

function overlapsRollingPeriod(node: ProductDevelopmentNode, period: DevelopmentPeriod): boolean {
  return period.kind === 'rolling' && node.daysUntilRequired !== null && node.plannedStart <= period.to && node.plannedEnd >= period.from;
}

function isOpenWaiting(node: ProductDevelopmentNode): boolean {
  const { followUp } = node;
  return node.status !== 'done' && node.status !== 'cancelled' && followUp !== undefined
    && (followUp.waiting.kind === 'waiting' || followUp.nextAction !== undefined || followUp.reviewOn !== undefined || followUp.managementDecision !== undefined);
}

function matchesNode({ project, node, filters }: {
  readonly project: ProductDevelopmentProject; readonly node: ProductDevelopmentNode; readonly filters: DevelopmentFilters;
}): boolean {
  return (filters.status === undefined || filters.status === node.status)
    && (filters.nodeOwner === null || filters.nodeOwner === (node.ownerUserId ?? 'unassigned'))
    && matchesKeyword(filters.keyword, [project.title, project.progress?.currentNote, node.title, node.formalLink?.oaRef]);
}

function matchesKeyword(keyword: string, fields: readonly (string | null | undefined)[]): boolean {
  const needle = keyword.toLocaleLowerCase();
  return needle === '' || fields.some((field) => field?.toLocaleLowerCase().includes(needle));
}

export function compareMilestones(left: DevelopmentNodeView, right: DevelopmentNodeView): number {
  return left.node.plannedEnd.localeCompare(right.node.plannedEnd) || left.node.title.localeCompare(right.node.title, 'zh-CN');
}

export function visibleDevelopmentProjects(views: readonly DevelopmentProjectView[], filters: DevelopmentFilters & { readonly includeAllMatching?: boolean }) {
  return views.filter((view) => {
    const { project, milestones, riskCount } = view;
    if (filters.productLead !== null && filters.productLead !== project.productLeadUserId) return false;
    if (filters.isRiskOnly) return riskCount > 0;
    return milestones.length > 0 || (filters.includeAllMatching === true && project.nodes.length > 0 && view.nodes.length > 0)
      || matchesEmptyProject(project, filters);
  }).sort(compareProjectPriority);
}

function matchesEmptyProject(project: ProductDevelopmentProject, filters: DevelopmentFilters): boolean {
  return project.nodes.length === 0 && filters.status === undefined && filters.nodeOwner === null
    && matchesKeyword(filters.keyword, [project.title, project.progress?.currentNote, project.progress?.contacts]);
}

function compareProjectPriority(left: DevelopmentProjectView, right: DevelopmentProjectView): number {
  return Number(right.riskCount > 0) - Number(left.riskCount > 0)
    || (left.next?.node.plannedEnd ?? '9999-12-31').localeCompare(right.next?.node.plannedEnd ?? '9999-12-31')
    || left.project.title.localeCompare(right.project.title, 'zh-CN');
}

type ProductLeadGroup = {
  readonly id: string;
  readonly name: string;
  readonly projects: DevelopmentProjectView[];
  riskCount: number;
};

export function groupDevelopmentByLead(projects: readonly DevelopmentProjectView[]): readonly ProductLeadGroup[] {
  const groups = new Map<string, ProductLeadGroup>();
  for (const view of projects) {
    const { productLeadUserId: id, productLeadName } = view.project;
    const lead = groups.get(id) ?? { id, name: productLeadName ?? '项目对接人待核对', projects: [], riskCount: 0 };
    lead.projects.push(view);
    lead.riskCount += view.riskCount;
    groups.set(id, lead);
  }
  return [...groups.values()].sort((left, right) => right.riskCount - left.riskCount || left.name.localeCompare(right.name, 'zh-CN'));
}
