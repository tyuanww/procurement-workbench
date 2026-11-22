import { Button, Card, Drawer, Empty, Flex, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { useState, type ReactNode } from 'react';
import type { ProjectProgress, ProjectProgressGroupView } from '@sw/contracts';
import { TaskDrawer } from '../../features/plan/index.js';
import { withGroup, workItemStatusLabel } from '../../features/today/index.js';
import { MetricStrip, type MetricItem } from '../../shared/ui/analytics.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { StatusTag } from '../../shared/ui/widgets.js';
import { drawerWide, space, statusColor, text } from '../../theme/tokens.js';

type ProgressRow = ProjectProgressGroupView & { readonly dimension: string };
type ProgressTask = NonNullable<ProjectProgress['details']>['tasks'][number];
type Risk = 'overdue' | 'blocked';
type Selection = { readonly kind: Risk } | { readonly kind: 'group'; readonly key: string };
type Tasks = { readonly title: string; readonly rows: readonly ProgressTask[] };

const RISK_LABEL = { overdue: '逾期', blocked: '阻塞' } satisfies Record<Risk, string>;

export function ProjectProgressPanel({ project, onChanged }: { readonly project: ProjectProgress; readonly onChanged: () => void }): ReactNode {
  const [selection, setSelection] = useState<Selection | null>(null);
  const groups = rowsOf(project);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {project.details === undefined ? null : <Typography.Text type="secondary">
        截至今日（{project.details.asOf}），统计与所选周期重叠的任务
      </Typography.Text>}
      {project.total === 0 ? <EmptyProgress /> : <>
        <MetricStrip ariaLabel="项目进度指标" items={[
          { key: 'total', label: '任务总数', value: project.total, tone: 'neutral' },
          { key: 'done', label: '已完成', value: project.done, tone: 'success', hint: rateText(project.completionRate) },
          riskMetric({ project, kind: 'overdue', onSelect: setSelection }),
          riskMetric({ project, kind: 'blocked', onSelect: setSelection }),
        ]} />
        <SectionGroup title="按负责人、供应商和工厂" meta={`${project.total} 条任务`}>
          <Table<ProgressRow> rowKey="key" size="small" pagination={false} scroll={{ x: 'max-content' }}
            dataSource={groups} columns={groupColumns((key) => setSelection({ kind: 'group', key }))} />
        </SectionGroup>
      </>}
      <TaskList tasks={tasksOf({ selection, groups, project })} period={`${project.from} 至 ${project.to}`}
        onClose={() => setSelection(null)} onChanged={onChanged} />
    </div>
  );
}

function EmptyProgress() {
  return <Card>
    <Empty description="这个周期没有排期任务。可以在今日排期查看今天的任务。">
      <Button type="primary" href={`/today?${withGroup({ search: '', group: 'schedule' })}`}>去今日排期</Button>
    </Empty>
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
    ...project.byOwner.map((row) => ({ ...row, key: `owner:${row.key}`, dimension: '负责人' })),
    ...project.bySupplier.map((row) => ({ ...row, key: `supplier:${row.key}`, dimension: '供应商' })),
    ...project.byFactory.map((row) => ({ ...row, key: `factory:${row.key}`, dimension: '工厂' })),
  ];
}

function groupColumns(onSelect: (key: string) => void): TableColumnsType<ProgressRow> {
  return [
    { title: '维度', dataIndex: 'dimension', width: 88 },
    { title: '对象', dataIndex: 'label', render: (value: string, row) => row.itemIds === undefined
      ? <Typography.Text strong>{value}</Typography.Text>
      : <Button type="link" aria-label={`查看${row.dimension} ${value}的任务`} style={{ paddingInline: 0 }} onClick={() => onSelect(row.key)}>{value}</Button> },
    { title: '任务', dataIndex: 'total', align: 'right' },
    { title: '完成', dataIndex: 'done', align: 'right' },
    { title: '逾期', dataIndex: 'overdue', align: 'right', render: (value: number) => <span style={{ color: value === 0 ? text.secondary : statusColor.danger.text }}>{value}</span> },
    { title: '阻塞', dataIndex: 'blocked', align: 'right' },
    { title: '完成率', dataIndex: 'completionRate', align: 'right', render: (value: number | null) => rateText(value) },
  ];
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
  return { title: `${group.dimension} · ${group.label}`, rows: tasks.filter(({ item }) => ids.has(item.id)) };
}

function TaskList({ tasks, period, onClose, onChanged }: {
  readonly tasks: Tasks | null; readonly period: string; readonly onClose: () => void; readonly onChanged: () => void;
}) {
  const [active, setActive] = useState<{ readonly id: string; readonly open: boolean } | null>(null);
  return <Drawer title={tasks?.title ?? '项目任务'} size={drawerWide} open={tasks !== null} onClose={() => { setActive(null); onClose(); }}>
    {tasks === null ? null : <Flex vertical gap="middle">
      <Typography.Text type="secondary">{period} · {tasks.rows.length} 条任务</Typography.Text>
      <Table<ProgressTask> rowKey={({ item }) => item.id} size="small" dataSource={tasks.rows} columns={taskColumns((id) => setActive({ id, open: true }))}
        scroll={{ x: 'max-content' }} locale={{ emptyText: '这个周期没有符合条件的任务' }}
        pagination={{ defaultPageSize: 10, hideOnSinglePage: true, showSizeChanger: false }} />
      <TaskDrawer key={active?.id} workItemId={active?.id ?? null} isOpen={active?.open ?? false}
        onClose={() => setActive((previous) => previous === null ? null : { ...previous, open: false })} onChanged={onChanged} />
    </Flex>}
  </Drawer>;
}

function taskColumns(onOpen: (id: string) => void): TableColumnsType<ProgressTask> {
  return [
    { title: '任务', key: 'title', render: (_, { item, overdue }) => <Flex vertical gap={space[0]}>
      <Button type="link" style={{ paddingInline: 0, alignSelf: 'start' }} onClick={() => onOpen(item.id)}>{item.title}</Button>
      <Flex gap={space[0]} wrap>
        <Tag>{workItemStatusLabel(item.status)}</Tag>
        {overdue ? <StatusTag status="overdue" label="逾期" /> : null}
      </Flex>
    </Flex> },
    { title: '计划起止', key: 'dates', render: (_, { item }) => <Flex vertical>
      <span>开始 {item.plannedStart}</span><span>到期 {item.plannedEnd}</span>
    </Flex> },
    { title: '关联范围', key: 'scope', render: (_, { item }) => <Flex vertical>
      <span>负责人 {item.ownerName ?? '未分配'}</span>
      <span>供应商 {item.supplierName ?? '未关联'} · 工厂 {item.factoryName ?? '未关联'}</span>
      {item.orderLine === null ? null : <span>
        {item.orderLine.poRaw ?? item.orderLine.nameRaw ?? item.orderLine.id}{item.batch === null ? '' : ` · 批次 #${item.batch.seq}`}
      </span>}
    </Flex> },
  ];
}

function rateText(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}
