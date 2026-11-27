import { RightOutlined } from '@ant-design/icons';
import { Empty, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { ProductDevelopmentNode } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { scheduleIntervalGeometry, type TimelineBar } from '../../features/progress/index.js';
import { TaskTagView } from '../../features/plan/index.js';
import { useShellViewport } from '../../features/shell/index.js';
import { plannedRangeText, workItemStatusLabel, workItemStatusTone } from '../../features/today/index.js';
import type { PlanningGroup, PlanningPoint, PlanningRow } from './planning-rows.js';
import { DevelopmentProjectLink } from './product-development-project-links.js';
import { compareMilestones, type DevelopmentNodeView, type DevelopmentPeriod, type DevelopmentProjectView } from './product-development-model.js';
import { DevelopmentNodeTimeline, type OpenDevelopmentNode } from './product-development-nodes.js';
import { DevelopmentCoordinationNodeFacts, DevelopmentFollowUpValue } from './product-development-progress.js';
import { coordinationItems, coordinationReasons, coordinationStatus, developmentNodeOwnerName, registeredFollowUpFacts, type DevelopmentCoordination } from './product-development-workflow.js';
import { needsDevelopmentReply } from './product-development-forecast.js';
import { PlanningTimeline } from './progress-timeline.js';
import { storeLabels } from './store-query.js';
import './product-development-gantt.css';

type DevelopmentGanttProps = {
  readonly projects: readonly DevelopmentProjectView[];
  readonly period: DevelopmentPeriod;
  readonly today: LocalDate;
  readonly open: OpenDevelopmentNode;
  readonly selectedRow?: string | null;
  readonly isCoordinating?: boolean;
  readonly presentation?: 'list' | 'gantt';
  readonly projectPath?: ((id: string) => { readonly search: string }) | undefined;
};

type DevelopmentPlanMarks =
  | { readonly bar: TimelineBar; readonly points: readonly [] }
  | { readonly bar: null; readonly points: readonly [] | readonly [PlanningPoint] };

export function isDevelopmentPlanInPeriod(
  { plannedStart, plannedEnd }: Pick<ProductDevelopmentNode, 'plannedStart' | 'plannedEnd'>,
  { from, to }: DevelopmentPeriod,
): boolean {
  return plannedStart <= to && plannedEnd >= from;
}

type GanttRows = Pick<DevelopmentGanttProps, 'period' | 'today'> & {
  readonly isCoordinating: boolean;
  readonly isList: boolean;
  readonly isOverviewList: boolean;
  readonly issues: ReturnType<typeof coordinationByNode>;
};

function ganttGroups({ projects, ...options }: GanttRows & Pick<DevelopmentGanttProps, 'projects'>): readonly PlanningGroup[] {
  const groups = projects.flatMap(({ project, nodes, next }) => {
    const priorityOptions = { ...options, next };
    const rows = nodes.filter((view) => includesGanttRow(view, options))
      .map((view) => ({ row: ganttRow(view, options), priority: rowPriority(view, priorityOptions) }))
      .sort((left, right) => left.priority - right.priority);
    if (rows.length === 0) return [];
    return [{
      key: `development:${project.id}`, title: project.title,
      meta: `${storeLabels[project.store]} · 项目负责人 ${project.productLeadName ?? '待核对'}`,
      rows: rows.map(({ row }) => row), priority: rows[0]?.priority ?? 0,
    }];
  });
  return groups.sort((left, right) => left.priority - right.priority);
}

function includesGanttRow({ node, placement }: DevelopmentNodeView, { period, isOverviewList, isCoordinating }: GanttRows) {
  return isDevelopmentPlanInPeriod(node, period) || (isOverviewList && (isCoordinating || placement === 'carry' || needsDevelopmentReply(node)));
}

function rowPriority({ node }: DevelopmentNodeView, { next, isCoordinating, isOverviewList, issues }: GanttRows & Pick<DevelopmentProjectView, 'next'>) {
  if (isCoordinating) {
    const issue = issues.get(node.id);
    return issue === undefined ? 3 : coordinationStatus(issue).priority;
  }
  if (!isOverviewList) return 0;
  if (node.status === 'done' || node.status === 'cancelled') return 2;
  return node.id === next?.node.id ? 0 : 1;
}

function coordinationByNode(projects: readonly DevelopmentProjectView[], today: LocalDate) {
  return new Map(projects.flatMap((view) => coordinationItems(view, today).flatMap((item) => item.kind === 'node' ? [[item.node.id, item] as const] : [])));
}

function ganttRow({ project, node, risk, waiting }: DevelopmentNodeView, options: GanttRows): PlanningRow {
  const { period, isCoordinating, isOverviewList, issues } = options;
  const item = issues.get(node.id);
  const status: PlanningRow['status'] = item !== undefined ? coordinationStatus(item) : risk === null
    ? { label: needsDevelopmentReply(node) ? '待我回复' : workItemStatusLabel(node.status), tone: workItemStatusTone(node.status) }
    : { label: risk, tone: node.status === 'blocked' ? 'danger' : 'warning' };
  return {
    id: `development:${project.id}:${node.id}`,
    source: { kind: 'development', project, node }, title: node.title,
    meta: isCoordinating || isOverviewList ? '' : [`负责人 ${developmentNodeOwnerName(node)}`, waiting === status.label ? null : waiting].filter(Boolean).join(' · '),
    status, ...planMarks(node, period), ...ganttRowDates(node, options),
  };
}

function ganttRowDates(node: ProductDevelopmentNode, { today, isCoordinating, isList }: GanttRows): Pick<PlanningRow, 'recordDate' | 'when'> {
  const isSingleDay = node.plannedStart === node.plannedEnd;
  const label = isSingleDay ? '项目要求' : '计划';
  const plan = isSingleDay ? node.plannedEnd : `${node.plannedStart} 至 ${node.plannedEnd}`;
  return { when: isList ? '' : `${label} ${plan}`, ...(isCoordinating ? {} : { recordDate: `${label} ${plannedRangeText(node, today)}` }) };
}

function planMarks({ plannedStart, plannedEnd, status }: ProductDevelopmentNode, period: DevelopmentPeriod): DevelopmentPlanMarks {
  if (!isDevelopmentPlanInPeriod({ plannedStart, plannedEnd }, period)) return { bar: null, points: [] };
  if (plannedStart === plannedEnd) return { bar: null, points: [{ kind: 'requirement', date: plannedEnd }] };
  return {
    bar: {
      ...scheduleIntervalGeometry({ from: plannedStart, to: plannedEnd }, period),
      tone: workItemStatusTone(status),
      label: '节点计划',
    },
    points: [],
  };
}

export function DevelopmentGantt({ projects, period, today, open, selectedRow = null, isCoordinating = false, presentation, projectPath }: DevelopmentGanttProps): ReactNode {
  const { band } = useShellViewport();
  const isList = presentation === undefined ? isCoordinating && band === 'phone' : presentation === 'list';
  const isOverviewList = isList && projectPath !== undefined;
  const issues = coordinationByNode(isCoordinating ? projects : [], today);
  const options = { period, today, isCoordinating, isList, isOverviewList, issues };
  const groups = ganttGroups({ projects, ...options });
  const withoutNodes = projectPath !== undefined && !isCoordinating ? projectsWithoutRows(projects, groups) : [];
  const carry = isOverviewList ? [] : nodesOutsideGantt({ projects, period, isCoordinating });
  return <div className="development-gantt">
    <DevelopmentGanttFigure {...{ ...options, groups, open, selectedRow, projectPath }} shouldShowEmpty={withoutNodes.length === 0} />
    <DevelopmentProjectsWithoutRows projects={withoutNodes} projectPath={projectPath} />
    <DevelopmentGanttCarry nodes={carry} {...{ projects, open, today, isCoordinating }} />
  </div>;
}

function projectsWithoutRows(projects: readonly DevelopmentProjectView[], groups: readonly PlanningGroup[]) {
  const keys = new Set(groups.map(({ key }) => key));
  return projects.filter(({ project }) => !keys.has(`development:${project.id}`));
}

function DevelopmentProjectsWithoutRows({ projects, projectPath }: Pick<DevelopmentGanttProps, 'projects' | 'projectPath'>) {
  if (projectPath === undefined || projects.length === 0) return null;
  return <ul className="development-projects-without-rows" aria-label="当前没有可显示节点的项目">
    {projects.map(({ project: { id, title, nodes } }) => <li key={id}>
      <span><strong>{title}</strong><Typography.Text type="secondary">{nodes.length === 0 ? '项目暂无开发节点' : '所选周期没有可显示的节点'}</Typography.Text></span>
      <DevelopmentProjectLink {...{ id, title }} to={projectPath(id)} />
    </li>)}
  </ul>;
}

function DevelopmentGanttCarry({ nodes, projects, open, today, isCoordinating }: Pick<DevelopmentGanttProps, 'projects' | 'open' | 'today'> & {
  readonly nodes: readonly DevelopmentNodeView[];
  readonly isCoordinating: boolean;
}) {
  if (nodes.length === 0) return null;
  return <section className="development-gantt-carry">
    <Typography.Title level={3}>周期外仍需处理</Typography.Title>
    <DevelopmentNodeTimeline nodes={nodes} open={open} showProject={isCoordinating || projects.length > 1}
      coordinationDate={isCoordinating ? today : undefined} />
  </section>;
}

function nodesOutsideGantt({ projects, period, isCoordinating }: Pick<DevelopmentGanttProps, 'projects' | 'period'> & { readonly isCoordinating: boolean }) {
  return projects.flatMap(({ nodes }) => nodes.filter(({ node, placement }) =>
    !isDevelopmentPlanInPeriod(node, period) && (isCoordinating || placement === 'carry' || needsDevelopmentReply(node)))).sort(compareMilestones);
}

function DevelopmentGanttFigure({ groups, period, today, open, selectedRow, isCoordinating, isList, isOverviewList, issues, projectPath, shouldShowEmpty }:
  GanttRows & Pick<DevelopmentGanttProps, 'projectPath'> & {
    readonly groups: readonly PlanningGroup[]; readonly open: OpenDevelopmentNode; readonly selectedRow: string | null; readonly shouldShowEmpty: boolean;
  }) {
  if (groups.length === 0 && !shouldShowEmpty) return null;
  return <figure className="development-gantt-figure" data-period={period.kind}>
    <DevelopmentGanttCaption period={period} shouldShowDates={projectPath === undefined} shouldShowPan={!isList && groups.length > 0} />
    {groups.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="development-empty" description="所选周期暂无开发计划。" />
      : <PlanningTimeline groups={groups} window={period} today={today} scale={period.kind === 'month' ? 'month' : 'week'} isList={isList}
        onOpen={open} selectedRow={selectedRow} ganttLabel="新品开发甘特图" legend={<DevelopmentGanttLegend />}
        renderRowFacts={isCoordinating && !isOverviewList ? ({ source }) => source.kind !== 'development' ? null
          : <DevelopmentCoordinationNodeFacts node={source.node} item={issues.get(source.node.id) ?? null} compact={projectPath !== undefined} /> : undefined}
        renderListContent={isOverviewList ? ({ source, status }) => source.kind !== 'development' ? null
          : <DevelopmentListRecord node={source.node} issue={issues.get(source.node.id)} {...{ status, today, period }} /> : undefined}
        renderGroupExtra={projectPath === undefined ? undefined : ({ title, rows }) => {
          const source = rows[0]?.source;
          return source?.kind === 'development' ? <DevelopmentProjectLink title={title} id={source.project.id} to={projectPath(source.project.id)} /> : null;
        }} />}
  </figure>;
}

function DevelopmentGanttCaption({ period, shouldShowDates, shouldShowPan }: Pick<GanttRows, 'period'> & {
  readonly shouldShowDates: boolean;
  readonly shouldShowPan: boolean;
}) {
  if (!shouldShowDates && !shouldShowPan) return null;
  return <figcaption className="development-gantt-caption">
    {shouldShowDates ? <span>计划周期 <time dateTime={period.from}>{period.from}</time> 至 <time dateTime={period.to}>{period.to}</time></span> : null}
    {shouldShowPan ? <span className="development-gantt-pan">可横向滚动查看日期</span> : null}
  </figcaption>;
}

function DevelopmentListRecord({ node, issue, status, today, period }: {
  readonly node: ProductDevelopmentNode;
  readonly issue: DevelopmentCoordination | undefined;
  readonly status: PlanningRow['status'];
} & Pick<GanttRows, 'today' | 'period'>): ReactNode {
  const facts = registeredFollowUpFacts(node.followUp);
  const action = facts.find(({ key }) => key === 'decision') ?? facts.find(({ key }) => key === 'next');
  return <span className="development-list-record">
    <span className="development-list-identity">
      <span className="development-list-title">
        <strong>{node.title}</strong>
        <TaskTagView tag={{ key: 'development-node-status', label: status.label, tone: status.tone, fill: 'solid' }} />
      </span>
      {action === undefined ? null : <span className="development-node-action">{action.label} <DevelopmentFollowUpValue fact={action} /></span>}
      <span className="development-list-owner">节点负责人 {developmentNodeOwnerName(node)}
        {issue === undefined ? null : coordinationReasons(issue).map((reason) => <span key={reason}> · {reason}</span>)}</span>
    </span>
    <DevelopmentListDates {...{ node, facts, today, period }} showWaiting={issue !== undefined || node.followUp?.waiting.kind === 'waiting'} />
    <RightOutlined className="development-list-chevron" aria-hidden />
  </span>;
}

function DevelopmentListDates({ node, facts, today, period, showWaiting }: {
  readonly node: ProductDevelopmentNode;
  readonly facts: ReturnType<typeof registeredFollowUpFacts>;
  readonly showWaiting: boolean;
} & Pick<GanttRows, 'today' | 'period'>) {
  const review = facts.find(({ key }) => key === 'review');
  const waiting = showWaiting ? facts.find(({ key }) => key === 'waiting') : undefined;
  return <span className="development-list-dates">
    <span className="development-list-deadlines">
      <span>{isDevelopmentPlanInPeriod(node, period) ? null : '周期外 · '}
        {node.plannedStart === node.plannedEnd ? '项目要求日' : '节点计划'} <strong>{plannedRangeText(node, today)}</strong></span>
      {review === undefined ? null : <span>{review.label} <DevelopmentFollowUpValue fact={review} /></span>}
    </span>
    {waiting === undefined ? null : <span>{waiting.label} <DevelopmentFollowUpValue fact={waiting} /></span>}
  </span>;
}

function DevelopmentGanttLegend() {
  return <div className="planning-legend">
    <Typography.Text><i className="planning-marker planning-marker-interval" aria-hidden="true" />节点计划</Typography.Text>
    <Typography.Text><i className="planning-marker planning-marker-requirement" aria-hidden="true" />项目要求日（单日节点）</Typography.Text>
  </div>;
}
