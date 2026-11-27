import { Button, Card, Drawer, Empty, Flex, Select, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { ProjectProgress, ProjectProgressGroupView } from '@sw/contracts';
import { useShellViewport } from '../../features/shell/index.js';
import { workItemStatusLabel } from '../../features/today/index.js';
import { useDetailFocusLink, useDetailReturnFocus } from '../../shared/hooks/detail-return-focus.js';
import { MetricStrip, type MetricItem } from '../../shared/ui/analytics.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { StatusTag } from '../../shared/ui/widgets.js';
import { drawerWide, space, statusColor, text } from '../../theme/tokens.js';
import { scheduleRiskTaskPath } from '../../features/progress/index.js';
import { riskHistoryIndex } from './schedule-risk-history.js';

const DIMENSIONS = { all: '全部维度', owner: '负责人', supplier: '供应商', factory: '工厂' } as const;
type Dimension = keyof typeof DIMENSIONS;
type ProgressRow = ProjectProgressGroupView & { readonly dimension: Exclude<Dimension, 'all'> };
const dimensionOptions = (['all', 'owner', 'supplier', 'factory'] as const).map((value) => ({ value, label: DIMENSIONS[value] }));
type ProgressTask = NonNullable<ProjectProgress['details']>['tasks'][number];
type Risk = 'overdue' | 'blocked';
type Selection = { readonly kind: Risk } | { readonly kind: 'group'; readonly key: string };
type Tasks = { readonly title: string; readonly rows: readonly ProgressTask[] };

const GROUPS_PER_PAGE = 20;
const TASKS_PER_PAGE = 10;

const RISK_LABEL = { overdue: '逾期', blocked: '阻塞' } satisfies Record<Risk, string>;

export function ScheduleRiskPanel({ project, scopeLabels, isFiltered }: {
  readonly project: ProjectProgress; readonly scopeLabels: readonly string[]; readonly isFiltered: boolean;
}): ReactNode {
  const isPhone = useShellViewport().band === 'phone';
  const filters = useRiskSelection(project);
  return (
    <Flex vertical gap={space[3]}>
      {project.total === 0 ? <EmptyProgress isFiltered={isFiltered} /> : <>
        <MetricStrip ariaLabel="排期任务进度指标" items={[
          { key: 'total', label: '任务总数', value: project.total, tone: 'neutral', hint: '与所选周期重叠的任务' },
          { key: 'done', label: '已完成', value: project.done, tone: 'success', hint: rateText(project.completionRate) },
          riskMetric({ project, kind: 'overdue', onSelect: filters.select }),
          riskMetric({ project, kind: 'blocked', onSelect: filters.select }),
        ]} />
        <SectionGroup title="任务分布" meta={project.details === undefined ? `${project.total} 条任务` : `状态截至 ${project.details.asOf}`}>
          <Flex vertical gap={space[2]}>
            <Select<Dimension> aria-label="分组维度" value={filters.dimension} options={dimensionOptions} onChange={filters.selectDimension} style={{ width: 160 }} />
            <Table<ProgressRow> rowKey="key" size="small" {...tableScroll(isPhone)}
              pagination={{ pageSize: GROUPS_PER_PAGE, current: filters.groupPage,
                hideOnSinglePage: true, showSizeChanger: false, onChange: (page) => filters.selectPage({ key: 'groupPage', page }) }}
              dataSource={filters.groups} columns={groupColumns({ isPhone, onSelect: (key) => filters.select({ kind: 'group', key }) })}
              locale={{ emptyText: '所选维度没有任务' }} />
          </Flex>
        </SectionGroup>
      </>}
      <TaskList filters={filters} project={project} scopeLabels={scopeLabels} isPhone={isPhone} />
    </Flex>
  );
}

function useRiskSelection(project: ProjectProgress) {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const dimension = dimensionOptions.find(({ value }) => value === params.get('dimension'))?.value ?? 'all';
  const selection = riskSelection(params.get('risk'), params.get('riskGroup'));
  const groups = rowsOf(project);
  const visibleGroups = dimension === 'all' ? groups : groups.filter((group) => group.dimension === dimension);
  const tasks = project.total === 0 ? null : tasksOf({ selection, groups, project });
  const groupPage = pageOf(params.get('groupPage'), { count: visibleGroups.length, pageSize: GROUPS_PER_PAGE });
  const taskPage = pageOf(params.get('riskPage'), { count: tasks?.rows.length ?? 0, pageSize: TASKS_PER_PAGE });
  const fixed = new URLSearchParams(params);
  writePage(fixed, { key: 'groupPage', page: groupPage });
  writePage(fixed, { key: 'riskPage', page: taskPage });
  if (tasks === null) clearSelection(fixed);
  const current = params.toString();
  const canonical = fixed.toString();
  useEffect(() => {
    if (canonical !== current) setParams(canonical, { replace: true, preventScrollReset: true, state });
  }, [canonical, current, setParams, state]);
  const select = (next: Selection | null): void => {
    const search = new URLSearchParams(canonical);
    clearSelection(search);
    if (next?.kind === 'group') search.set('riskGroup', next.key);
    else if (next !== null) search.set('risk', next.kind);
    setParams(search, { replace: true, preventScrollReset: true });
  };
  const selectDimension = (value: Dimension): void => {
    const search = new URLSearchParams(canonical);
    if (value === 'all') search.delete('dimension');
    else search.set('dimension', value);
    search.delete('groupPage');
    setParams(search, { replace: true, preventScrollReset: true });
  };
  const selectPage = (change: PageChange): void => {
    const search = new URLSearchParams(canonical);
    writePage(search, change);
    setParams(search, { replace: true, preventScrollReset: true });
  };
  return { dimension, groups: visibleGroups, tasks, groupPage, taskPage, params: fixed, select, selectDimension, selectPage };
}

function clearSelection(params: URLSearchParams): void {
  for (const key of ['risk', 'riskGroup', 'riskPage']) params.delete(key);
}

function riskSelection(risk: string | null, group: string | null): Selection | null {
  if (risk === 'overdue' || risk === 'blocked') return { kind: risk };
  return group === null ? null : { kind: 'group', key: group };
}

function pageOf(raw: string | null, { count, pageSize }: { readonly count: number; readonly pageSize: number }): number {
  const page = Number(raw);
  const lastPage = Math.max(1, Math.ceil(count / pageSize));
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, lastPage) : 1;
}

type PageChange = { readonly key: 'groupPage' | 'riskPage'; readonly page: number };

function writePage(params: URLSearchParams, { key, page }: PageChange): void {
  if (page === 1) params.delete(key);
  else params.set(key, String(page));
}

function EmptyProgress({ isFiltered }: { readonly isFiltered: boolean }) {
  return <Card>
    <Empty description={isFiltered ? '所选期间和筛选范围内没有排期任务，可调整统计期间或返回排期更改筛选。'
      : '所选期间没有排期任务，可调整统计期间。'} />
  </Card>;
}

function riskMetric({ project, kind, onSelect }: {
  readonly project: ProjectProgress; readonly kind: Risk; readonly onSelect: (selection: Selection) => void;
}): MetricItem {
  return {
    key: kind, label: RISK_LABEL[kind], value: project[kind], tone: kind === 'overdue' ? 'danger' : 'warning',
    ...(project.details === undefined ? {} : { hint: '查看任务', action: { select: () => onSelect({ kind }) } }),
  };
}

function rowsOf(project: ProjectProgress): ProgressRow[] {
  return [
    ...project.byOwner.map((row) => ({ ...row, key: `owner:${row.key}`, dimension: 'owner' as const })),
    ...project.bySupplier.map((row) => ({ ...row, key: `supplier:${row.key}`, dimension: 'supplier' as const })),
    ...project.byFactory.map((row) => ({ ...row, key: `factory:${row.key}`, dimension: 'factory' as const })),
  ];
}

function groupColumns({ isPhone, onSelect }: { readonly isPhone: boolean; readonly onSelect: (key: string) => void }): TableColumnsType<ProgressRow> {
  if (isPhone) return [{ title: '分组及任务数', key: 'summary', rowScope: 'row', render: (_, row) => <Flex vertical>
    <Typography.Text type="secondary">{DIMENSIONS[row.dimension]}</Typography.Text>
    <GroupAction row={row} onSelect={onSelect} />
    <span>任务 {row.total} · 完成 {row.done} · 完成率 {rateText(row.completionRate)}</span>
    <span>逾期 {row.overdue} · 阻塞 {row.blocked}</span>
  </Flex> }];
  return [
    { title: '维度', dataIndex: 'dimension', width: 88, render: (_, row) => DIMENSIONS[row.dimension] },
    { title: '对象', dataIndex: 'label', rowScope: 'row', render: (_, row) => <GroupAction row={row} onSelect={onSelect} /> },
    { title: '任务', dataIndex: 'total', align: 'right' },
    { title: '完成', dataIndex: 'done', align: 'right' },
    { title: '逾期', dataIndex: 'overdue', align: 'right', render: (value: number) => <span style={{ color: value === 0 ? text.secondary : statusColor.danger.text }}>{value}</span> },
    { title: '阻塞', dataIndex: 'blocked', align: 'right' },
    { title: '完成率', dataIndex: 'completionRate', align: 'right', render: (value: number | null) => rateText(value) },
  ];
}

function GroupAction({ row, onSelect }: { readonly row: ProgressRow; readonly onSelect: (key: string) => void }): ReactNode {
  return row.itemIds === undefined ? <Typography.Text strong>{row.label}</Typography.Text> : (
    <Button type="link" aria-label={`查看${DIMENSIONS[row.dimension]} ${row.label}的任务`}
      style={{ paddingInline: 0, alignSelf: 'start', textAlign: 'start', whiteSpace: 'normal', overflowWrap: 'anywhere', height: 'auto' }}
      onClick={() => onSelect(row.key)}>{row.label}</Button>
  );
}

function tasksOf({ project, selection, groups }: {
  readonly project: ProjectProgress; readonly selection: Selection | null; readonly groups: readonly ProgressRow[];
}): Tasks | null {
  if (selection === null || project.details === undefined) return null;
  const { tasks } = project.details;
  if (selection.kind !== 'group') {
    const kind = selection.kind;
    return { title: `${RISK_LABEL[kind]}任务`, rows: tasks.filter((task) => kind === 'overdue' ? task.overdue : task.item.status === 'blocked') };
  }
  const group = groups.find((row) => row.key === selection.key);
  if (group?.itemIds === undefined) return null;
  const ids = new Set(group.itemIds);
  return { title: `${DIMENSIONS[group.dimension]} · ${group.label}`, rows: tasks.filter(({ item }) => ids.has(item.id)) };
}

function TaskList({ filters, project, scopeLabels, isPhone }: {
  readonly filters: ReturnType<typeof useRiskSelection>; readonly project: ProjectProgress;
  readonly scopeLabels: readonly string[]; readonly isPhone: boolean;
}) {
  const [isOpened, setOpened] = useState(false);
  const { tasks } = filters;
  return <Drawer title={tasks?.title ?? '排期任务'} size={`min(${drawerWide}px, 100vw)`} open={tasks !== null}
    focusable={{ trap: true, focusTriggerAfterClose: true }} onClose={() => filters.select(null)} afterOpenChange={setOpened}>
    {tasks === null ? null : <TaskRows tasks={tasks} from={project.from} to={project.to} isPhone={isPhone} isOpened={isOpened}
      scopeLabels={scopeLabels} params={filters.params} page={filters.taskPage} onPage={(page) => filters.selectPage({ key: 'riskPage', page })} />}
  </Drawer>;
}

function TaskRows({ tasks, from, to, scopeLabels, isPhone, isOpened, params, page, onPage }: {
  readonly tasks: Tasks; readonly from: string; readonly to: string; readonly isPhone: boolean; readonly isOpened: boolean;
  readonly scopeLabels: readonly string[]; readonly params: URLSearchParams; readonly page: number; readonly onPage: (page: number) => void;
}): ReactNode {
  useDetailReturnFocus(isOpened && tasks.rows.length > 0, { allowContainerFocus: true });
  return <Flex vertical gap="middle">
    <Typography.Text type="secondary" style={{ overflowWrap: 'anywhere' }}>
      {from} 至 {to} · {scopeLabels.join(' · ')} · {tasks.rows.length} 条任务
    </Typography.Text>
    <Table<ProgressTask> rowKey={({ item }) => item.id} size="small" dataSource={tasks.rows}
      columns={taskColumns({ isPhone, to, params })} {...tableScroll(isPhone)}
      locale={{ emptyText: '所选期间没有符合条件的任务' }}
      pagination={{ pageSize: TASKS_PER_PAGE, current: page, hideOnSinglePage: true, showSizeChanger: false, onChange: onPage }} />
  </Flex>;
}

function tableScroll(isPhone: boolean) {
  return isPhone ? {} : { scroll: { x: 'max-content' } };
}

function taskColumns({ isPhone, to, params }: { readonly isPhone: boolean; readonly to: string; readonly params: URLSearchParams }): TableColumnsType<ProgressTask> {
  const identity = (task: ProgressTask) => <RiskTaskLink task={task}
    to={scheduleRiskTaskPath({ id: task.item.id, anchor: task.item.plannedEnd < to ? task.item.plannedEnd : to, search: params })} />;
  if (isPhone) return [{ title: '任务、计划起止及关联范围', key: 'summary', rowScope: 'row', render: (_, task) => <Flex vertical gap={space[1]}>
    {identity(task)}<TaskDates item={task.item} /><TaskScope item={task.item} />
  </Flex> }];
  return [
    { title: '任务', key: 'title', rowScope: 'row', render: (_, task) => identity(task) },
    { title: '计划起止', key: 'dates', render: (_, { item }) => <TaskDates item={item} /> },
    { title: '关联范围', key: 'scope', render: (_, { item }) => <TaskScope item={item} /> },
  ];
}

function RiskTaskLink({ task: { item, overdue }, to }: { readonly task: ProgressTask; readonly to: string }): ReactNode {
  const focus = useDetailFocusLink(to);
  const { key } = useLocation();
  const sourceIndex = riskHistoryIndex(key);
  const state = sourceIndex === null ? focus.state : { ...focus.state, riskSourceIndex: sourceIndex };
  return <Flex vertical gap={space[0]}>
    <Link to={to} {...focus} state={state} style={{ alignSelf: 'start', overflowWrap: 'anywhere' }}>{item.title}</Link>
    <Flex gap={space[0]} wrap>
      <Tag>{workItemStatusLabel(item.status)}</Tag>
      {overdue ? <StatusTag status="overdue" label="逾期" /> : null}
    </Flex>
  </Flex>;
}

function TaskDates({ item }: { readonly item: ProgressTask['item'] }): ReactNode {
  return <Flex vertical><span>开始 {item.plannedStart}</span><span>到期 {item.plannedEnd}</span></Flex>;
}

function TaskScope({ item }: { readonly item: ProgressTask['item'] }): ReactNode {
  return <Flex vertical style={{ overflowWrap: 'anywhere' }}>
    <span>负责人 {item.ownerName ?? '未分配'}</span>
    <span>供应商 {item.supplierName ?? '未关联'} · 工厂 {item.factoryName ?? '未关联'}</span>
    {item.orderLine === null ? null : <span>
      {item.orderLine.poRaw ?? item.orderLine.nameRaw ?? item.orderLine.id}{item.batch === null ? '' : ` · 批次 #${item.batch.seq}`}
    </span>}
  </Flex>;
}

function rateText(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}
