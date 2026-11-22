import { Button, Card, Empty, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import type { ReactNode } from 'react';
import type { ProjectProgress, ProjectProgressGroupView } from '@sw/contracts';
import { withGroup } from '../../features/today/index.js';
import { MetricStrip } from '../../shared/ui/analytics.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { space, statusColor, text } from '../../theme/tokens.js';

type ProgressRow = ProjectProgressGroupView & { readonly dimension: string };

export function ProjectProgressPanel(props: { readonly project: ProjectProgress }): ReactNode {
  if (props.project.total === 0) {
    return (
      <Card>
        <Empty description="这个周期没有排期任务。可以在今日排期查看今天的任务。">
          <Button type="primary" href={`/today?${withGroup({ search: '', group: 'schedule' })}`}>去今日排期</Button>
        </Empty>
      </Card>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <MetricStrip
        ariaLabel="项目进度指标"
        items={[
          { key: 'total', label: '任务总数', value: props.project.total, tone: 'neutral' },
          { key: 'done', label: '已完成', value: props.project.done, tone: 'success', hint: rateText(props.project.completionRate) },
          { key: 'overdue', label: '逾期', value: props.project.overdue, tone: 'danger' },
          { key: 'blocked', label: '阻塞', value: props.project.blocked, tone: 'warning' },
        ]}
      />
      <SectionGroup title="按负责人、供应商和工厂" meta={`${props.project.total} 条任务`}>
        <Table<ProgressRow> rowKey="key" size="small" pagination={false} dataSource={rowsOf(props.project)} columns={columns()} />
      </SectionGroup>
    </div>
  );
}

function rowsOf(project: ProjectProgress): ProgressRow[] {
  return [
    ...project.byOwner.map((row) => ({ ...row, key: `owner:${row.key}`, dimension: '负责人' })),
    ...project.bySupplier.map((row) => ({ ...row, key: `supplier:${row.key}`, dimension: '供应商' })),
    ...project.byFactory.map((row) => ({ ...row, key: `factory:${row.key}`, dimension: '工厂' })),
  ];
}

function columns(): TableColumnsType<ProgressRow> {
  return [
    { title: '维度', dataIndex: 'dimension', width: 88 },
    { title: '对象', dataIndex: 'label', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
    { title: '任务', dataIndex: 'total', align: 'right' },
    { title: '完成', dataIndex: 'done', align: 'right' },
    { title: '逾期', dataIndex: 'overdue', align: 'right', render: (value: number) => <span style={{ color: value === 0 ? text.secondary : statusColor.danger.text }}>{value}</span> },
    { title: '阻塞', dataIndex: 'blocked', align: 'right' },
    { title: '完成率', dataIndex: 'completionRate', align: 'right', render: (value: number | null) => rateText(value) },
  ];
}

function rateText(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}
