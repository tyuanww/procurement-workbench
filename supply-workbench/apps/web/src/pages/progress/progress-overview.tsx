import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Button, Card, Flex, Select, Typography } from 'antd';
import type { OrderLineRow } from '@sw/contracts';
import type { ReactNode } from 'react';
import { PROGRESS_STAYS, type ProgressDrill, type ProgressInsight, type ProgressStageCount, type ProgressStay } from '../../features/progress/index.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { bg, space } from '../../theme/tokens.js';
import { progressFilterStyle, ProgressOaFilter } from './store-order.js';

const STAGE_COLOR: Partial<Record<ProgressStageCount['key'], string>> = {
  no_batch: '#2a78d6',
  awaiting_date: '#eb6834',
  awaiting_shipment: '#1baf7a',
  awaiting_receipt: '#eda100',
  partially_received: '#e87ba4',
};
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
const stayOptions = [{ value: '', label: '全部停留' }, ...PROGRESS_STAYS.map(({ bucket, label }) => ({ value: bucket, label }))];

export function ProgressFilters({ filters, lines, oa, stay, drill, overdue, onOa, onStay, onDrill }: {
  readonly filters: ReactNode;
  readonly lines: readonly (OrderLineRow | undefined)[];
  readonly oa: string | null;
  readonly stay: ProgressStay | null;
  readonly drill: ProgressDrill;
  readonly overdue: number | null;
  readonly onOa: (value: string | null) => void;
  readonly onStay: (value: ProgressStay | null) => void;
  readonly onDrill: (value: ProgressDrill) => void;
}) {
  return (
    <Card size="small" style={{ marginBottom: space[3] }}>
      <Flex gap={space[2]} wrap align="center" role="group" aria-label="当前进度筛选">
        {filters}
        <ProgressOaFilter lines={lines} value={oa} onChange={onOa} />
        <Select
          aria-label="停留天数"
          value={stay ?? ''}
          options={stayOptions}
          style={progressFilterStyle}
          onChange={(value) => onStay(PROGRESS_STAYS.find(({ bucket }) => bucket === value)?.bucket ?? null)}
        />
        {overdue === null ? null : <Button aria-pressed={drill.kind === 'overdue'} onClick={() => onDrill({ kind: 'overdue' })}>逾期未到 {overdue} 行</Button>}
        <Button type="text" aria-disabled={drill.kind === 'all'} onClick={() => onDrill({ kind: 'all' })}>清除下钻</Button>
        <ProcurementCutoff />
      </Flex>
    </Card>
  );
}

export function ProgressBreakdown({ insight, drill, onDrill }: {
  readonly insight: ProgressInsight;
  readonly drill: ProgressDrill;
  readonly onDrill: (drill: ProgressDrill) => void;
}) {
  const slices = stageSlices(insight);
  return (
    <Card size="small" style={{ marginBottom: space[3] }}>
      <Flex align="center" wrap gap={space[3]}>
        <Flex align="baseline" gap={space[1]}>
          <Typography.Text strong>进度分布</Typography.Text>
          <Typography.Text type="secondary">{formatQuantity(insight.total)} 条订单行</Typography.Text>
        </Flex>
        {slices === null ? <Typography.Text type="secondary">阶段数据待核对</Typography.Text> : (
          <Flex align="center" gap={space[2]} style={{ flex: '1 1 456px', minWidth: 0 }}>
            <div aria-hidden="true" style={{
              width: 64, aspectRatio: '1', borderRadius: '50%', flexShrink: 0, background: slices.background,
              display: 'grid', placeItems: 'center',
            }}>
              <div style={{ width: 40, aspectRatio: '1', borderRadius: '50%', background: bg.surface }} />
            </div>
            <Flex wrap role="group" aria-label="按进度阶段筛选" style={{ minWidth: 0 }}>
              {slices.stages.map(({ key, label, count, color }) => {
                const isSelected = drill.kind === 'stage' && drill.stage === key;
                return (
                  <Button key={key} size="small" type={isSelected ? 'default' : 'text'} aria-pressed={isSelected} onClick={() => onDrill({ kind: 'stage', stage: key })}>
                    <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color }} />
                    {label} {formatQuantity(count)} 行 · {percent.format(count / insight.total)}
                  </Button>
                );
              })}
            </Flex>
          </Flex>
        )}
      </Flex>
    </Card>
  );
}

function stageSlices(insight: ProgressInsight) {
  if (insight.total === 0 || insight.stages.reduce((sum, stage) => sum + stage.count, 0) !== insight.total) return null;
  const stages = insight.stages.map((stage) => ({ ...stage, color: STAGE_COLOR[stage.key] ?? '#6e6777' }));
  let accumulated = 0;
  const stops = stages.map(({ count, color }) => {
    const from = accumulated / insight.total;
    accumulated += count;
    return `${color} ${from}turn ${accumulated / insight.total}turn`;
  });
  return { stages, background: `conic-gradient(${stops.join(', ')})` };
}
