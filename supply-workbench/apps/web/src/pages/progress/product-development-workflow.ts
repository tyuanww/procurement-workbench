import type { DevelopmentNodeFollowUpInput, ProductDevelopmentNode, ProductDevelopmentProject } from '@sw/contracts';
import { diffDays, type LocalDate } from '@sw/domain';
import type { TaskTone } from '../../features/today/index.js';
import { developmentRiskOf, hasVerifiedBatchReceipt } from './product-development-forecast.js';
import type { DevelopmentProjectView } from './product-development-model.js';

export const developmentStages = {
  development: '开发中',
  ordered: '已下单',
  received: '已入仓（人工登记）',
  review: '待确认',
} as const;
export type ProjectStageFilter = keyof typeof developmentStages;
export type ProjectStage = ProjectStageFilter | 'received-unverified';

export const displayedProjectStages = {
  ...developmentStages,
  received: '已入仓（已核实）',
  'received-unverified': '已入仓（人工登记，待核对）',
} satisfies Record<ProjectStage, string>;

export function projectStage(project: ProductDevelopmentProject): ProjectStage {
  const warehouseNodes = project.nodes.filter(({ destination, status, formalLink, batches }) => destination === 'finished_to_warehouse'
    && (status !== 'cancelled' || (formalLink !== null && batches.some((batch) => batch.status !== 'cancelled'))));
  if (warehouseNodes.length > 0 && warehouseNodes.every(hasVerifiedWarehouseReceipt)) return 'received';
  const confirmedStage = project.progress?.confirmedStage;
  if (confirmedStage === 'received') return 'received-unverified';
  return confirmedStage ?? (warehouseNodes.some(({ formalLink }) => formalLink !== null) ? 'ordered' : 'review');
}

export function projectStageFilter(project: ProductDevelopmentProject): ProjectStageFilter {
  const stage = projectStage(project);
  return stage === 'received-unverified' ? 'review' : stage;
}

function hasVerifiedWarehouseReceipt({ batches, formalLink }: ProductDevelopmentNode): boolean {
  const active = batches.filter(({ status }) => status !== 'cancelled');
  return formalLink !== null && active.length > 0 && active.every(hasVerifiedBatchReceipt);
}

function projectDateRisk(project: ProductDevelopmentProject, today: LocalDate): string | null {
  if (projectStage(project) === 'received') return null;
  const required = project.progress?.requirement?.date;
  if (required === undefined) return null;
  const forecast = project.progress?.forecast?.date ?? required;
  const lateDays = diffDays(forecast, required);
  const overdue = diffDays(today, required);
  if (lateDays > 0) return `预计晚 ${lateDays} 天`;
  if (overdue > 0) return `要求日期已过 ${overdue} 天 · 待核对`;
  return null;
}

type CoordinationDecision =
  | { readonly kind: 'management' }
  | { readonly kind: 'verify'; readonly reviewReason: 'missing' | 'late' | null }
  | { readonly kind: 'follow-up' };

type CoordinationSubject = { readonly kind: 'node'; readonly node: ProductDevelopmentNode } | { readonly kind: 'project' };

export type DevelopmentCoordination = CoordinationSubject & {
  readonly followUp: DevelopmentNodeFollowUpInput | undefined;
  readonly risk: string | null;
  readonly decision: CoordinationDecision;
};

const coordinationStates = {
  management: { label: '明确管理介入', tone: 'danger', priority: 0 },
  verify: { label: '优先核对', tone: 'warning', priority: 1 },
  'follow-up': { label: '负责人按约跟进', tone: 'neutral', priority: 2 },
} satisfies Record<CoordinationDecision['kind'], { readonly label: string; readonly tone: TaskTone; readonly priority: number }>;

export function coordinationStatus({ decision }: DevelopmentCoordination) {
  return coordinationStates[decision.kind];
}

export function coordinationReasons({ decision, risk }: DevelopmentCoordination): readonly string[] {
  const reasons = risk === null ? [] : [`风险原因 ${risk}`];
  if (decision.kind === 'verify' && decision.reviewReason !== null) {
    reasons.push(decision.reviewReason === 'late' ? '下次跟进日已过' : '下次跟进日待核对');
  }
  return reasons;
}

function coordinationDecision({ followUp, risk, today, includeRisk }: Pick<DevelopmentCoordination, 'followUp' | 'risk'> & {
  readonly today: LocalDate;
  readonly includeRisk: boolean;
}): CoordinationDecision | null {
  if (followUp?.managementDecision) return { kind: 'management' };
  const reviewOn = followUp?.reviewOn;
  const reviewReason = followUp === undefined ? null : reviewDateIssue(followUp, today);
  if (reviewReason !== null || (risk !== null && (includeRisk || reviewOn !== undefined))) {
    return { kind: 'verify', reviewReason };
  }
  return reviewOn === undefined ? null : { kind: 'follow-up' };
}

function reviewDateIssue({ waiting, nextAction, reviewOn }: DevelopmentNodeFollowUpInput, today: LocalDate) {
  if (reviewOn !== undefined) return reviewOn < today ? 'late' : null;
  return waiting.kind === 'waiting' || nextAction !== undefined ? 'missing' : null;
}

export function developmentNodeCoordination({ node, today, includeRisk = true }: {
  readonly node: ProductDevelopmentNode;
  readonly today: LocalDate;
  readonly includeRisk?: boolean;
}): DevelopmentCoordination | null {
  const isTerminal = node.status === 'done' || node.status === 'cancelled';
  const risk = developmentRiskOf(node);
  if (isTerminal && risk === null) return null;
  const followUp = isTerminal ? undefined : node.followUp;
  const decision = coordinationDecision({ followUp, risk, today, includeRisk });
  return decision === null ? null : { kind: 'node', node, followUp, risk, decision };
}

export function developmentProjectCoordination(project: ProductDevelopmentProject, today: LocalDate): DevelopmentCoordination | null {
  const followUp = project.progress?.followUp;
  const risk = projectDateRisk(project, today);
  const decision = coordinationDecision({ followUp, risk, today, includeRisk: true });
  return decision === null ? null : { kind: 'project', followUp, risk, decision };
}

export function coordinationItems(view: DevelopmentProjectView, today: LocalDate): readonly DevelopmentCoordination[] {
  const items = view.nodes.flatMap(({ node, placement }) => {
    const item = developmentNodeCoordination({ node, today, includeRisk: placement !== 'outside' });
    return item === null ? [] : [item];
  });
  const project = developmentProjectCoordination(view.project, today);
  if (project !== null) items.push(project);
  return items.sort((left, right) => coordinationStatus(left).priority - coordinationStatus(right).priority);
}

export function coordinationParty({ followUp }: DevelopmentCoordination): string {
  return followUpParty(followUp?.waiting);
}

export function developmentNodeOwnerName({ ownerName, ownerUserId }: Pick<ProductDevelopmentNode, 'ownerName' | 'ownerUserId'>): string {
  return ownerName ?? (ownerUserId === null ? '未分配' : '待核对');
}

function followUpParty(waiting: DevelopmentNodeFollowUpInput['waiting'] | undefined): string {
  if (waiting?.kind === 'none') return '无需等待';
  return (waiting?.kind === 'waiting' ? waiting.party : undefined) ?? '等待方待核对';
}

type FollowUpFact = { readonly key: 'waiting' | 'deliverable' | 'next' | 'decision'; readonly label: string; readonly value: string }
  | { readonly key: 'review'; readonly label: string; readonly value: LocalDate };

export function registeredFollowUpFacts(followUp: DevelopmentNodeFollowUpInput | undefined): readonly FollowUpFact[] {
  const { waiting, nextAction, reviewOn, managementDecision } = followUp ?? {};
  const facts: FollowUpFact[] = [{ key: 'waiting', label: '在等谁', value: followUpParty(waiting) }];
  if (waiting?.kind === 'waiting' && waiting.deliverable !== undefined) {
    facts.push({ key: 'deliverable', label: '等什么', value: waiting.deliverable });
  }
  if (nextAction !== undefined) facts.push({ key: 'next', label: '下一步', value: nextAction });
  if (reviewOn !== undefined) facts.push({ key: 'review', label: '下次跟进日', value: reviewOn });
  if (managementDecision !== undefined) facts.push({ key: 'decision', label: '需要管理者决定', value: managementDecision });
  return facts;
}
