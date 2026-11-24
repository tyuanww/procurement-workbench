import { lineStageText, type LineStage } from '@sw/domain';
import type { LineSummary } from '@sw/contracts';
import type { ReactNode } from 'react';
import { MetricStrip, StackedBarChart, type MetricTone } from '../../../shared/ui/analytics.js';
import { SectionGroup } from '../../../shared/ui/section.js';

const STAGE_TONE: Record<LineStage, MetricTone> = {
  no_batch: 'neutral',
  awaiting_date: 'warning',
  awaiting_shipment: 'info',
  awaiting_receipt: 'info',
  partially_received: 'attention',
  done: 'success',
  cancelled: 'neutral',
};

export function LineSummaryStrip(input: { readonly summary: LineSummary }): ReactNode {
  return (
    <SectionGroup title="筛选结果概览" meta={`${input.summary.total} 行`}>
      <MetricStrip
        ariaLabel="跟进中心筛选结果指标"
        items={[
          { key: 'total', label: '订单行', value: input.summary.total, tone: 'neutral' },
          { key: 'overdue', label: '逾期', value: input.summary.overdue, tone: 'danger', hint: '按确认到货日' },
          { key: 'due', label: '今日应到', value: input.summary.dueToday, tone: 'warning' },
          { key: 'missing', label: '缺确认日期', value: input.summary.missingDate, tone: 'attention' },
        ]}
      />
      <div style={{ marginTop: 12 }}>
        <StackedBarChart
          ariaLabel="订单行阶段分布"
          rows={[{
            key: 'total',
            label: '阶段',
            segments: input.summary.stages.map((row) => ({
              key: row.stage,
              label: lineStageText(row.stage),
              value: row.count,
              tone: STAGE_TONE[row.stage],
            })),
          }]}
        />
      </div>
    </SectionGroup>
  );
}
