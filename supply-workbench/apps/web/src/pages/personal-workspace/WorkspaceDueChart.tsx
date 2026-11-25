import { Chart } from '@antv/g2';
import { memo, useEffect, useRef } from 'react';
import { formatQuantity } from '../../shared/ui/format.js';
import { border, brand, fontSize, radius, text } from '../../theme/tokens.js';

type DueDay = { readonly date: string; readonly count: number };
type DueChartProps = { readonly days: readonly DueDay[] };
const height = 28;
const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'UTC' });
const chartCss = `
.workspace-due-days { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; text-align: center; font-size: ${fontSize.meta}px; color: ${text.secondary}; line-height: 1.4; }
.workspace-due-days dt { white-space: nowrap; }
.workspace-due-days dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.workspace-due-full-date { display: none; }
@container workspace-metric (min-width: 145px) {
  .workspace-due-short-date { display: none; }
  .workspace-due-full-date { display: inline; }
}
`;

function WorkspaceDueChart({ days }: DueChartProps) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (container.current === null) return;
    const chart = new Chart({ container: container.current, autoFit: true, height, padding: 0 });
    chart.options({
      type: 'interval', margin: 0, padding: 0, data: [...days],
      encode: { x: 'date', y: 'count' },
      scale: { x: { padding: 0 }, y: { domainMin: 0, nice: false } },
      axis: false, legend: false, animate: false,
      style: { fill: brand[600], maxWidth: 24, insetLeft: 1, insetRight: 1, radiusTopLeft: radius - 2, radiusTopRight: radius - 2 },
      tooltip: { title: 'date', items: [{ field: 'count', name: '到期任务', valueFormatter: (count: number) => `${formatQuantity(count)} 项` }] },
      interaction: { tooltip: { series: true, shared: true, marker: false, crosshairs: false } },
    });
    void chart.render();
    return () => chart.destroy();
  }, [days]);

  return (
    <>
      <style>{chartCss}</style>
      <div ref={container} aria-hidden="true" style={{ inlineSize: '100%', blockSize: height, borderBlockEnd: `1px solid ${border}`, boxSizing: 'content-box' }} />
      <dl className="workspace-due-days" aria-label="按到期日统计任务数">
        {days.map((day) => <DayCount key={day.date} {...day} />)}
      </dl>
    </>
  );
}

export default memo(WorkspaceDueChart, ({ days }, next) => days.length === next.days.length &&
  days.every(({ date, count }, index) => date === next.days[index]?.date && count === next.days[index]?.count));

function DayCount({ date, count }: DueDay) {
  return (
    <div>
      <dt><time dateTime={date} title={date} aria-label={date}>
        <span className="workspace-due-short-date">{weekday.format(new Date(date))}</span>
        <span className="workspace-due-full-date">{date.slice(5)}</span>
      </time></dt>
      <dd>{formatQuantity(count)}</dd>
    </div>
  );
}
