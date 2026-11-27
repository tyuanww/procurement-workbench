import { ClockCircleOutlined, FilterOutlined } from '@ant-design/icons';
import { Button, Card, Dropdown, Empty, Flex, Select, Timeline, Typography } from 'antd';
import { useId, useState, type ReactNode } from 'react';
import { WorkItemStatusSchema } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { useShellViewport } from '../../features/shell/index.js';
import { workItemStatusLabel } from '../../features/today/index.js';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { DevelopmentGantt, isDevelopmentPlanInPeriod } from './product-development-gantt.js';
import { DevelopmentPeriodControls, DevelopmentSearch } from './product-development-controls.js';
import { needsDevelopmentReply } from './product-development-forecast.js';
import { DevelopmentProjectFollowUps } from './product-development-project-links.js';
import { PlanningMetric } from './weekly-delivery-summary.js';
import {
  groupDevelopmentByLead, hasDevelopmentFilters, visibleDevelopmentProjects,
  type DevelopmentFilters, type DevelopmentPeriod, type DevelopmentProjectView,
} from './product-development-model.js';
import type { OpenDevelopmentNode } from './product-development-nodes.js';
import { coordinationItems, coordinationParty, coordinationStatus, displayedProjectStages, projectStageFilter, type ProjectStageFilter } from './product-development-workflow.js';

type OverviewView = 'list' | 'gantt';
const projectViews = [
  { label: '明细', value: 'list' }, { label: '甘特图', value: 'gantt' },
] satisfies { readonly label: string; readonly value: OverviewView }[];
const managementModes = [{ label: '项目进度', value: 'progress' }, { label: '需要协调', value: 'coordination' }];
const stageKeys: readonly ProjectStageFilter[] = ['development', 'ordered', 'received', 'review'];
const stages = stageKeys.map((value) => ({ value, label: displayedProjectStages[value] }));

type Overview = {
  readonly filters: DevelopmentFilters;
  readonly open: OpenDevelopmentNode;
  readonly period: DevelopmentPeriod;
  readonly projects: readonly DevelopmentProjectView[];
  readonly isManagement: boolean;
  readonly isMine: boolean;
  readonly storePicker: ReactNode;
  readonly createAction: ReactNode;
  readonly params: URLSearchParams;
  readonly today: LocalDate;
  readonly clear: () => void;
  readonly projectPath: (id: string) => { readonly search: string };
  readonly write: (key: string, value: string | null) => void;
};

function selectProjects(props: Overview) {
  const { params, today } = props;
  const isCoordinating = props.isManagement && ((params.get('developmentFocus') ?? (props.filters.isRiskOnly ? 'coordination' : 'progress')) === 'coordination');
  const stage = stages.find(({ value }) => value === params.get('developmentStage'))?.value;
  const waiting = isCoordinating ? params.get('developmentWaiting') : null;
  const projects = overviewProjects(props);
  const pending = projects.map((view) => ({ view, items: coordinationItems(view, today) })).filter(({ items }) => items.length > 0);
  const queue = pending.map(({ view }) => view);
  const scoped = isCoordinating ? pending.flatMap(({ view, items }) => {
    const first = items.find((item) => waiting === null || waiting === coordinationParty(item));
    return first === undefined ? [] : [{ view, priority: coordinationStatus(first).priority }];
  }).sort((left, right) => left.priority - right.priority).map(({ view }) => view) : projects;
  const results = scoped.filter(({ project }) => stage === undefined || projectStageFilter(project) === stage);
  return { isCoordinating, stage, waiting, scoped, queue, results };
}

function overviewProjects({ projects, filters, isManagement, period }: Pick<Overview, 'projects' | 'filters' | 'isManagement' | 'period'>) {
  const matching = visibleDevelopmentProjects(projects, { ...filters, isRiskOnly: false, includeAllMatching: true });
  if (isManagement) return matching;
  return matching.filter(({ project, nodes, milestones }) => project.nodes.length === 0 || milestones.length > 0
    || nodes.some(({ node }) => isDevelopmentPlanInPeriod(node, period) || needsDevelopmentReply(node)));
}

export function DevelopmentOverview(props: Overview): ReactNode {
  const { write, params } = props;
  const { band } = useShellViewport();
  const isPhone = band === 'phone';
  const requestedView = params.get('developmentOverview');
  const view = requestedView === 'cards' ? 'list' : projectViews.find(({ value }) => value === requestedView)?.value ?? (isPhone ? 'list' : 'gantt');
  const { isCoordinating, stage, waiting, scoped, queue, results } = selectProjects(props);
  const hasSecondaryFilters = filtersInUse({ ...props, stage, waiting });
  const hasFilters = hasSecondaryFilters || hasDevelopmentFilters(props.filters);
  return <>
    <OverviewToolbar {...props} {...{ isCoordinating, isPhone, stage, waiting, queue, hasSecondaryFilters, view }} count={results.length} />
    {isPhone || isCoordinating ? null : <StageSummary projects={scoped} {...{ stage, write }} />}
    <section className="development-result-surface" aria-label="新品项目结果">
      <OverviewResults {...props} projects={results} {...{ isCoordinating, view, hasFilters }} waitingParty={waiting} />
    </section>
  </>;
}

function OverviewToolbar({ count, view, ...props }: OverviewFilterProps & { readonly count: number; readonly view: OverviewView }) {
  const { write, isCoordinating } = props;
  const presentation = <ViewSwitch aria-label="新品项目视图" options={projectViews} value={view}
    onChange={(value) => write('developmentOverview', value)} />;
  const heading = <Flex align="baseline" gap={8}>
    <Typography.Title level={2}>{props.isMine ? '我的项目' : '新品项目'}</Typography.Title>
    <Typography.Text type="secondary" className="development-project-count" role="status">{count} 个项目</Typography.Text>
  </Flex>;
  const management = props.isManagement ? <ViewSwitch aria-label="新品管理视图" options={managementModes}
    value={isCoordinating ? 'coordination' : 'progress'} onChange={(value) => write('developmentFocus', value)} /> : null;
  return <Card size="small" className="development-toolbar">
    <OverviewFilters {...props} {...{ heading, management, presentation }} />
  </Card>;
}

type OverviewFilterProps = Overview & {
  readonly isCoordinating: boolean;
  readonly isPhone: boolean;
  readonly stage: ProjectStageFilter | undefined;
  readonly waiting: string | null;
  readonly queue: readonly DevelopmentProjectView[];
  readonly hasSecondaryFilters: boolean;
};

function OverviewFilters({ filters, period, storePicker, isManagement, projects, write, isCoordinating, isPhone, stage, waiting, queue, today,
  hasSecondaryFilters, createAction, heading, management, presentation }: OverviewFilterProps & {
    readonly heading: ReactNode;
    readonly management: ReactNode;
    readonly presentation: ReactNode;
  }) {
  const id = useId();
  const [isFiltersOpen, setFiltersOpen] = useState(false);
  return <>
    <div className="development-toolbar-controls">
      <div className="development-overview-heading">{heading}{isPhone ? createAction : null}</div>
      {management}
      <DevelopmentPeriodControls {...{ period, write, isPhone }} actions={<div className="development-quick-actions">
        <DevelopmentSearch value={filters.keyword} onSearch={(value) => write('planSearch', value || null)} />
        <Button className="development-filter-toggle" aria-expanded={isFiltersOpen} aria-controls={id}
          aria-description={hasSecondaryFilters ? '已应用筛选' : undefined} type={hasSecondaryFilters ? 'primary' : 'default'}
          icon={<FilterOutlined aria-hidden />} onClick={() => setFiltersOpen((value) => !value)}>筛选</Button>
      </div>} />
      {isPhone ? null : <div className="development-toolbar-end">{presentation}{createAction}</div>}
    </div>
    <div className="development-filters" id={id} hidden={!isFiltersOpen}>
      {isPhone ? <div className="development-display-options">{presentation}</div> : null}
      {storePicker}
      {isManagement ? <Select aria-label="项目负责人" placeholder="全部负责人" value={filters.productLead} allowClear
        options={groupDevelopmentByLead(projects).map((lead) => ({ value: lead.id, label: lead.name }))}
        onChange={(lead) => write('developmentLead', lead ?? null)} /> : null}
      <Select aria-label="项目阶段" placeholder="全部项目阶段" value={stage} allowClear options={stages}
        onChange={(value) => write('developmentStage', value ?? null)} />
      {isCoordinating ? <WaitingFilter {...{ waiting, queue, write, today }} /> : null}
      <Select aria-label="节点状态" placeholder="全部节点状态" value={filters.status ?? null} allowClear
        options={WorkItemStatusSchema.options.map((value) => ({ value, label: workItemStatusLabel(value) }))}
        onChange={(status) => write('status', status ?? null)} />
      {filters.nodeOwner === null ? null : <Button onClick={() => write('ownerUserId', null)}>清除节点负责人筛选</Button>}
    </div>
  </>;
}

function WaitingFilter({ waiting, queue, write, today }: Pick<Overview, 'write' | 'today'> & {
  readonly waiting: string | null;
  readonly queue: readonly DevelopmentProjectView[];
}) {
  const parties = [...new Set(queue.flatMap((view) => coordinationItems(view, today).map(coordinationParty)))];
  const options = parties.sort((left, right) => left.localeCompare(right, 'zh-CN')).map((party) => ({ key: party, label: party }));
  return <Dropdown trigger={['click']} autoFocus menu={{
    selectable: true, selectedKeys: [waiting ?? ''],
    items: [{ key: '', label: '全部等待方' }, ...options],
    onClick: ({ key }) => write('developmentWaiting', key || null),
  }}>
    <Button aria-label={waiting === null ? '筛选等待方' : `等待方 ${waiting}`} title={waiting ?? '筛选等待方'}
      aria-haspopup="menu" icon={<ClockCircleOutlined aria-hidden />} type={waiting === null ? 'default' : 'primary'}>{waiting ?? '等待方'}</Button>
  </Dropdown>;
}

function filtersInUse({ filters, stage, waiting, params }: Pick<Overview, 'filters' | 'params'> & {
  readonly stage: ProjectStageFilter | undefined;
  readonly waiting: string | null;
}): boolean {
  return filters.productLead !== null || filters.nodeOwner !== null || filters.status !== undefined || stage !== undefined || waiting !== null || params.has('store');
}

function StageSummary({ projects, stage, write }: Pick<Overview, 'projects' | 'write'> & { readonly stage: ProjectStageFilter | undefined }) {
  const counts: Record<ProjectStageFilter, number> = { development: 0, ordered: 0, received: 0, review: 0 };
  for (const { project } of projects) counts[projectStageFilter(project)] += 1;
  return <div className="weekly-delivery-summary development-stage-summary" role="group" aria-label="按项目阶段筛选">
    {stages.map(({ label, value }) => <PlanningMetric key={value} title={label} unit="个"
      value={counts[value]} isSelected={stage === value}
      onClick={() => write('developmentStage', stage === value ? null : value)} />)}
  </div>;
}

function OverviewResults({ projects, period, projectPath, open, today, clear, params, isCoordinating, view, hasFilters, waitingParty }: Overview & {
  readonly isCoordinating: boolean;
  readonly view: OverviewView;
  readonly hasFilters: boolean;
  readonly waitingParty: string | null;
}) {
  if (projects.length === 0) return <Card size="small">
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? '当前筛选下没有项目。' : isCoordinating ? '当前没有需要协调的项目。' : '当前范围内没有新品项目。'}>
      {hasFilters ? <Button onClick={clear}>清除筛选</Button> : null}
    </Empty>
  </Card>;
  return <OverviewTimeline {...{ projects, period, today, open, projectPath, isCoordinating, waitingParty }}
    selectedRow={params.get('planSelected')} presentation={view} />;
}

function OverviewTimeline({ projects, period, today, open, projectPath, isCoordinating, waitingParty, selectedRow, presentation }:
  Pick<Overview, 'projects' | 'period' | 'today' | 'open' | 'projectPath'> & {
    readonly isCoordinating: boolean;
    readonly waitingParty: string | null;
    readonly selectedRow: string | null;
    readonly presentation: OverviewView;
  }) {
  const { scheduled, projectIssues } = ganttProjects({ projects, today, waitingParty, isCoordinating });
  return <>
    <DevelopmentProjectFollowUps entries={projectIssues.filter(({ item }) => item.decision.kind === 'management')} projectPath={projectPath} />
    {scheduled.length === 0 ? null : <Card size="small" className="planning-record-card development-gantt-surface" classNames={{ body: 'planning-record-body' }}>
      <DevelopmentGantt projects={scheduled} {...{ period, today, open, selectedRow, isCoordinating, presentation, projectPath }} />
    </Card>}
    <DevelopmentProjectFollowUps entries={projectIssues.filter(({ item }) => item.decision.kind !== 'management')} projectPath={projectPath} />
    {period.kind === 'month' && !isCoordinating ? <MonthlyProjectDates {...{ projects, period }} /> : null}
  </>;
}

function ganttProjects({ projects, today, waitingParty, isCoordinating }: Pick<Overview, 'projects' | 'today'> & {
  readonly waitingParty: string | null;
  readonly isCoordinating: boolean;
}) {
  if (!isCoordinating) return { scheduled: projects, projectIssues: [] };
  const issues = projects.map((view) => ({ view, items: coordinationItems(view, today)
    .filter((item) => waitingParty === null || coordinationParty(item) === waitingParty) }));
  return {
    scheduled: issues.flatMap(({ view, items }) => {
      const byId = new Map(view.nodes.map((node) => [node.node.id, node]));
      const nodes = items.flatMap((item) => {
        const match = item.kind === 'node' ? byId.get(item.node.id) : undefined;
        return match === undefined ? [] : [match];
      });
      return nodes.length === 0 ? [] : [{ ...view, nodes }];
    }),
    projectIssues: issues.flatMap(({ view, items }) => {
      const item = items.find(({ kind }) => kind === 'project');
      return item === undefined ? [] : [{ project: view.project, item }];
    }),
  };
}

function MonthlyProjectDates({ projects, period }: Pick<Overview, 'projects' | 'period'>) {
  const projectDates = projects.flatMap(({ project }) => [
    { kind: '项目要求', value: project.progress?.requirement }, { kind: '预计', value: project.progress?.forecast },
  ].flatMap(({ kind, value }) => value?.date === undefined || value.date < period.from || value.date > period.to ? [] :
    [{ key: `${project.id}:${kind}`, date: value.date, text: `${project.title} · ${kind}` }]))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (projectDates.length === 0) return null;
  return <Card size="small" title="项目要求与预计">
    <Timeline items={projectDates.map(({ key, date, text }) => ({ key, content: <><time dateTime={date}>{date}</time> · {text}</> }))} />
  </Card>;
}
