import { Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { progressDrillKey, progressDrillLabel, readProgressDrill, type ProgressDrill, type ProgressInsight } from '../../features/progress/index.js';
import { MetricStrip, StackedBarChart, type MetricItem } from '../../shared/ui/analytics.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { dwellColor, space, text } from '../../theme/tokens.js';

type OverviewInput = {
  readonly insight: ProgressInsight;
  readonly drill: ProgressDrill;
  readonly onDrill: (drill: ProgressDrill) => void;
};

export function ProgressMetrics(input: OverviewInput): ReactNode {
  return <MetricStrip ariaLabel="进度关键指标" items={metricItems(input)} />;
}

export function ProgressBreakdown(input: OverviewInput): ReactNode {
  return (
    <SectionGroup title="进度分布" meta={`${input.insight.total} 行`}>
      <div style={chartGridStyle()}>
        <ChartPanel title="阶段分布"><ProgressStageChart {...input} /></ChartPanel>
        <ChartPanel title="停留天数分布"><ProgressStayChart {...input} /></ChartPanel>
      </div>
    </SectionGroup>
  );
}

function metricItems({ insight, drill, onDrill }: OverviewInput): MetricItem[] {
  const metrics: readonly { readonly filter: ProgressDrill; readonly value: number; readonly tone: NonNullable<MetricItem['tone']>; readonly label?: string; readonly hint?: string }[] = [
    { filter: { kind: 'overdue' }, value: insight.overdue, tone: 'danger', hint: '按确认到货日' },
    { filter: { kind: 'stage', stage: 'no_batch' }, value: insight.pendingBatch, tone: 'neutral' },
    { filter: { kind: 'stage', stage: 'awaiting_date' }, value: insight.awaitingDate, tone: 'warning' },
    { filter: { kind: 'stay', bucket: '15+' }, value: insight.longStay, tone: 'attention', label: '停留 15 天以上' },
  ];
  const selected = progressDrillKey(drill);
  return metrics.map(({ filter, label, tone, value, hint }) => ({
    key: progressDrillKey(filter), label: label ?? progressDrillLabel(filter), value, unit: ' 行', tone,
    ...(hint === undefined ? {} : { hint }),
    action: { isActive: selected === progressDrillKey(filter), select: () => onDrill(filter) },
  }));
}

function ProgressStageChart({ insight, drill, onDrill }: OverviewInput): ReactNode {
  return <StackedBarChart
    ariaLabel="订单行阶段分布"
    scale="count"
    rows={insight.stages.map(({ key, label, count, tone }) => ({
      key, label, total: count,
      segments: [{ key, label, value: count, tone, isActive: drill.kind === 'stage' && drill.stage === key }],
      onSelect: () => onDrill({ kind: 'stage', stage: key }),
    }))}
  />;
}

function ProgressStayChart({ insight, drill, onDrill }: OverviewInput): ReactNode {
  return <StackedBarChart
    ariaLabel="订单行停留天数分布"
    showValues
    rows={[{
      key: 'stay', label: '全部',
      segments: insight.stays.map(({ bucket, label, count }) => ({
        key: bucket, label, value: count, fill: dwellColor[bucket], isActive: drill.kind === 'stay' && drill.bucket === bucket,
      })),
      onSelect: (key) => onDrill(readProgressDrill(`stay:${key}`)),
    }]}
  />;
}

function ChartPanel(input: { readonly title: string; readonly children: ReactNode }): ReactNode {
  return (
    <div style={{ minWidth: 0 }}>
      <Typography.Text strong style={{ color: text.primary }}>{input.title}</Typography.Text>
      <div style={{ marginTop: space[1] }}>{input.children}</div>
    </div>
  );
}

function chartGridStyle(): CSSProperties {
  return { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: space[3], marginTop: space[3] };
}
