import { Card, Flex, Skeleton, Typography } from 'antd';
import { lazy, Suspense } from 'react';
import type { BatchFulfillment } from '@sw/domain';
import { formatQuantity } from '../../shared/ui/format.js';
import { space, statusColor } from '../../theme/tokens.js';

const BatchProgressChart = lazy(() => import('./batch-progress-chart.js'));

export function BatchProgress({ facts }: { readonly facts: BatchFulfillment | undefined }) {
  if (facts === undefined || facts.unit === null) {
    return <Typography.Text type="secondary">批次交付数量待核实</Typography.Text>;
  }
  const segments = [
    { label: '未发', value: facts.unshippedQty, color: statusColor.warning.text },
    { label: '在途待收', value: facts.inTransitQty, color: statusColor.info.text },
    { label: '实收', value: facts.receivedQty, color: statusColor.success.text },
  ];
  const known = segments.flatMap((segment) => segment.value === null ? [] : [{ ...segment, value: segment.value }]);
  const hasDistribution = known.length === segments.length && known.some(({ value }) => value > 0);
  return <Card size="small" title="批次交付" style={{ marginBlock: space[2] }}>
    {hasDistribution ? <Suspense fallback={<Skeleton.Input size="small" active block />}><BatchProgressChart segments={known} unit={facts.unit} /></Suspense> : null}
    <Flex wrap gap={space[2]} align="center" role="group" aria-label="批次交付数量">
      {segments.map(({ label, value, color }) => <Flex key={label} gap={space[0]} align="center">
        <span style={{ width: space[1], height: space[1], borderRadius: 2, background: color }} aria-hidden="true" />
        <Typography.Text type="secondary">{label}</Typography.Text>
        <Typography.Text strong>{value === null ? '待核实' : formatQuantity(value) + ' ' + facts.unit}</Typography.Text>
      </Flex>)}
    </Flex>
  </Card>;
}
