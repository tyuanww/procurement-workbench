import { Chart } from '@antv/g2';
import { useEffect, useRef } from 'react';
import { formatQuantity } from '../../shared/ui/format.js';

export type BatchSegment = { readonly label: string; readonly value: number; readonly color: string };

export default function BatchProgressChart({ segments, unit }: {
  readonly segments: readonly BatchSegment[];
  readonly unit: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (container.current === null) return;
    const chart = new Chart({ container: container.current, autoFit: true, height: 26, padding: 0 });
    chart.options({
      type: 'interval',
      margin: 0,
      padding: 0,
      data: segments.filter((segment) => segment.value > 0),
      coordinate: { transform: [{ type: 'transpose' }] },
      transform: [{ type: 'stackY' }],
      encode: { x: () => '交付', y: 'value', color: 'label' },
      scale: {
        x: { padding: 0.16 },
        color: { domain: segments.map(({ label }) => label), range: segments.map(({ color }) => color) },
      },
      axis: false,
      legend: false,
      animate: false,
      style: { inset: 1, radius: 4 },
      tooltip: {
        title: 'label',
        items: [{ field: 'value', name: '数量', valueFormatter: (value: number) => formatQuantity(value) + ' ' + unit }],
      },
    });
    void chart.render();
    return () => chart.destroy();
  }, [segments, unit]);

  return <div ref={container} style={{ width: '100%', height: 26 }} aria-hidden="true" />;
}
