import { Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import type { ProgressInsight } from '../../features/progress/index.js';
import { MetricStrip, StackedBarChart } from '../../shared/ui/analytics.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { dwellColor, space, text } from '../../theme/tokens.js';

export function ProgressOverview(input: { readonly insight: ProgressInsight }): ReactNode {
  return (
    <SectionGroup title="进度概览" meta={`${input.insight.total} 行`}>
      <MetricStrip
        ariaLabel="进度关键指标"
        items={[
          { key: 'total', label: '进行中订单行', value: input.insight.total, tone: 'neutral' },
          { key: 'overdue', label: '逾期未到', value: input.insight.overdue, tone: 'danger', hint: '按确认到货日' },
          { key: 'missing', label: '缺确认日期', value: input.insight.missingDate, tone: 'warning' },
          { key: 'long', label: '停留 15 天以上', value: input.insight.longStay, tone: 'attention' },
        ]}
      />
      <div style={chartGridStyle()}>
        <ChartPanel title="阶段分布">
          <StackedBarChart
            ariaLabel="订单行阶段分布"
            scale="count"
            rows={input.insight.stages.map((stage) => ({
              key: stage.key,
              label: stage.label,
              segments: [{ key: stage.key, label: stage.label, value: stage.count, tone: stage.tone }],
              total: stage.count,
            }))}
          />
        </ChartPanel>
        <ChartPanel title="停留天数分布">
          <StackedBarChart
            ariaLabel="订单行停留天数分布"
            showValues
            rows={[{
              key: 'stay',
              label: '全部',
              segments: input.insight.stays.map((stay) => ({ key: stay.bucket, label: stay.label, value: stay.count, fill: dwellColor[stay.bucket] })),
            }]}
          />
        </ChartPanel>
      </div>
    </SectionGroup>
  );
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
  return { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: space[3], marginTop: space[3] };
}
