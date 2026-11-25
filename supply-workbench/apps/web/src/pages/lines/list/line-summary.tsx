import { DownOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Typography } from 'antd';
import { lineStageText, type LineStage } from '@sw/domain';
import type { LineSummary } from '@sw/contracts';
import { useId, useState } from 'react';
import { MetricStrip, StackedBarChart, type MetricTone } from '../../../shared/ui/analytics.js';
import { space } from '../../../theme/tokens.js';
import { useLineSummary } from './use-line-summary.js';

const STAGE_TONE: Record<LineStage, MetricTone> = {
  no_batch: 'neutral',
  awaiting_date: 'warning',
  awaiting_shipment: 'info',
  awaiting_receipt: 'info',
  partially_received: 'attention',
  done: 'success',
  cancelled: 'neutral',
};

export function LineResultSummary({ query, reload, total }: {
  readonly query: string;
  readonly reload: number;
  readonly total: number | null;
}) {
  const [openQuery, setOpenQuery] = useState<string | null>(null);
  if (openQuery !== null && openQuery !== query) setOpenQuery(null);
  const isOpen = openQuery === query;
  const summaryId = useId();
  return (
    <>
      <Flex align="center" gap={space[2]} style={{ minHeight: 32, marginBlock: space[1] }}>
        <Typography.Text type="secondary" role="status">{total === null ? '' : `共 ${total} 行`}</Typography.Text>
        <Button
          type="text"
          size="small"
          aria-expanded={isOpen}
          aria-controls={summaryId}
          icon={<DownOutlined aria-hidden style={{ rotate: isOpen ? '180deg' : undefined }} />}
          iconPlacement="end"
          onClick={() => setOpenQuery(isOpen ? null : query)}
        >
          筛选结果概览
        </Button>
      </Flex>
      <div id={summaryId} hidden={!isOpen}>
        {isOpen ? <SummaryBody query={query} reload={reload} /> : null}
      </div>
    </>
  );
}

function SummaryBody(request: Parameters<typeof useLineSummary>[0]) {
  const result = useLineSummary(request);
  if (result.summary !== null) return <LineSummaryStrip summary={result.summary} />;
  if (result.error !== '') return <Alert type="error" showIcon title="订单汇总没有读出来" description={result.error} />;
  return <p role="status">正在读取订单汇总…</p>;
}

function LineSummaryStrip({ summary }: { readonly summary: LineSummary }) {
  return (
    <div style={{ marginBlockEnd: space[2] }}>
      <MetricStrip
        ariaLabel="跟进中心筛选结果指标"
        items={[
          { key: 'total', label: '订单行', value: summary.total, tone: 'neutral' },
          { key: 'overdue', label: '逾期', value: summary.overdue, unit: ' 行', tone: 'danger', hint: '含逾期开放批次' },
          { key: 'due', label: '今日应到', value: summary.dueToday, unit: ' 行', tone: 'warning', hint: '下一到货为今日' },
          { key: 'missing', label: '待确认阶段', value: summary.missingDate, unit: ' 行', tone: 'attention' },
        ]}
      />
      <div style={{ marginTop: space[3] }}>
        <StackedBarChart
          ariaLabel="订单行阶段分布"
          rows={[{
            key: 'total',
            label: '阶段',
            segments: summary.stages.map((row) => ({
              key: row.stage,
              label: lineStageText(row.stage),
              value: row.count,
              tone: STAGE_TONE[row.stage],
            })),
          }]}
        />
      </div>
    </div>
  );
}
