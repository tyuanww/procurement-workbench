import { Typography } from 'antd';
import { LOW_SAMPLE_THRESHOLD } from '@sw/domain';
import type { ReactNode } from 'react';
import type { DashboardLoad } from '../../features/performance/index.js';
import { MetricStrip, RateBars } from '../../shared/ui/analytics.js';
import { space } from '../../theme/tokens.js';

export function SupplierRateChart(input: { readonly inputs: DashboardLoad['suppliers'] }): ReactNode {
  const rows = input.inputs
    .flatMap((item) => {
      const denominator = item.onTime.denominator;
      const numerator = item.onTime.numerator;
      if (denominator === null || numerator === null || item.onTime.n < LOW_SAMPLE_THRESHOLD) return [];
      return [{ key: item.partyId, label: item.displayName ?? '未命名主体', rate: numerator / denominator, hint: `${numerator}/${denominator} 批` }];
    })
    .sort((left, right) => right.rate - left.rate || left.label.localeCompare(right.label))
    .slice(0, 8);
  if (rows.length === 0) return null;
  return (
    <ChartBlock title="供应商准时率" hint="按应到批次加权，最多 8 家">
      <RateBars ariaLabel="供应商准时率" rows={rows} />
    </ChartBlock>
  );
}

export function BuyerLoadSummary(input: { readonly inputs: DashboardLoad['buyers'] }): ReactNode {
  const open = input.inputs.reduce((sum, row) => sum + row.openBatches, 0);
  const overdue = input.inputs.reduce((sum, row) => sum + row.overdue, 0);
  const missing = input.inputs.reduce((sum, row) => sum + row.missingDate, 0);
  return (
    <MetricStrip
      ariaLabel="采购负荷汇总"
      items={[
        { key: 'open', label: '开放批次', value: open, tone: 'neutral' },
        { key: 'overdue', label: '逾期', value: overdue, tone: 'danger' },
        { key: 'missing', label: '缺确认日期', value: missing, tone: 'warning' },
      ]}
    />
  );
}

function ChartBlock(input: { readonly title: string; readonly hint: string; readonly children: ReactNode }): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <Typography.Title level={2} style={{ margin: 0 }}>{input.title}</Typography.Title>
      <Typography.Text type="secondary">{input.hint}</Typography.Text>
      {input.children}
    </div>
  );
}
