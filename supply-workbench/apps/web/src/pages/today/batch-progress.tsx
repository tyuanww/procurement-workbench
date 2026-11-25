import { Card, Flex, Skeleton, Typography } from 'antd';
import { lazy, Suspense } from 'react';
import type { BatchFulfillment } from '@sw/domain';
import { formatQuantity } from '../../shared/ui/format.js';
import { space, statusColor } from '../../theme/tokens.js';
import type { BatchSegment } from './batch-progress-chart.js';

const BatchProgressChart = lazy(() => import('./batch-progress-chart.js'));

export function progressOf(facts: BatchFulfillment | undefined): { readonly segments: readonly BatchSegment[]; readonly unit: string } | null {
  if (facts === undefined) return null;
  const { receivedQty, inTransitQty, unshippedQty, unit } = facts;
  if (unit === null || receivedQty === null || inTransitQty === null || unshippedQty === null) return null;
  if (receivedQty + inTransitQty + unshippedQty === 0) return null;
  return {
    unit,
    segments: [
      { label: '未发', value: unshippedQty, color: statusColor.warning.text },
      { label: '在途待收', value: inTransitQty, color: statusColor.info.text },
      { label: '实收', value: receivedQty, color: statusColor.success.text },
    ],
  };
}

export function BatchProgress({ segments, unit }: NonNullable<ReturnType<typeof progressOf>>) {
  return <Card size="small" title="批次交付" style={{ marginBlock: space[2] }}>
    <Suspense fallback={<Skeleton.Input size="small" active block />}><BatchProgressChart segments={segments} unit={unit} /></Suspense>
    <Flex wrap gap={space[2]} align="center" role="group" aria-label="批次交付数量">
      {segments.map(({ label, value, color }) => <Flex key={label} gap={space[0]} align="center">
        <span style={{ width: space[1], height: space[1], borderRadius: 2, background: color }} aria-hidden="true" />
        <Typography.Text type="secondary">{label}</Typography.Text>
        <Typography.Text strong>{formatQuantity(value)} {unit}</Typography.Text>
      </Flex>)}
    </Flex>
  </Card>;
}
