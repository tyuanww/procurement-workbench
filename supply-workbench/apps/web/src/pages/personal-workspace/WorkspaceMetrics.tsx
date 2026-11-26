import { CheckOutlined } from '@ant-design/icons';
import { Button, Card, Statistic, Typography } from 'antd';
import { lazy, Suspense, useId, type ReactNode } from 'react';
import { bg, brand, fontSize, radiusCard, space, text } from '../../theme/tokens.js';
import { matchesMetric, shiftDay, type MetricScope, type PersonalTask } from './workspace-model.js';

const WorkspaceDueChart = lazy(() => import('./WorkspaceDueChart.js'));

type CardScope = Exclude<MetricScope, 'all'>;
type MetricDefinition = { readonly scope: CardScope; readonly label: string; readonly hint: string };
const definitions: readonly MetricDefinition[] = [
  { scope: 'due', label: '今日待办', hint: '今日到期 · 未完成' },
  { scope: 'soon', label: '即将到期', hint: '未来 3 天内到期' },
  { scope: 'done', label: '本周完成', hint: '本周到期 · 已完成' },
];

const metricsCss = `
.workspace-metrics { display: grid; gap: ${space[1]}px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.workspace-metric { min-inline-size: 0; container: workspace-metric / inline-size; cursor: pointer; }
.workspace-metric .workspace-metric-body { display: grid; gap: ${space[1]}px; padding: ${space[2]}px ${space[1]}px; }
.workspace-metric .workspace-metric-action { position: absolute; inset: 0; z-index: 1; inline-size: 100%; block-size: 100%; border-radius: ${radiusCard}px; background: transparent; }
.workspace-metric .workspace-metric-action:is(:hover, :active) { background: transparent; box-shadow: inset 0 0 0 1px ${brand[600]}; }
.workspace-metric .workspace-metric-action:focus-visible { outline: 2px solid ${brand[800]}; outline-offset: 2px; }
.workspace-metric-chart { position: relative; z-index: 2; min-inline-size: 0; }
.workspace-metric-chart canvas { display: block; max-inline-size: 100%; }
@container workspace-metric (min-width: 145px) {
  .workspace-metric .workspace-metric-body { padding: ${space[3]}px; }
}
@container workspace-metric (min-width: 270px) {
  .workspace-metric .workspace-metric-body { padding: ${space[4]}px; align-items: center; }
  .workspace-metric .workspace-metric-body:has(.workspace-metric-chart) { grid-template-columns: minmax(max-content, 1fr) minmax(120px, 1fr); }
}
`;

export function WorkspaceMetrics({ tasks, today, scope, onScope }: {
  readonly tasks: readonly PersonalTask[];
  readonly today: string;
  readonly scope: MetricScope;
  readonly onScope: (scope: MetricScope) => void;
}) {
  return (
    <div className="workspace-metrics" role="group" aria-label="任务指标">
      <style>{metricsCss}</style>
      {definitions.map((definition) => {
        const matching = tasks.filter((task) => matchesMetric(task, { scope: definition.scope, today }));
        const isActive = scope === definition.scope;
        return <WorkspaceMetricCard key={definition.scope} definition={definition} count={matching.length} isActive={isActive}
          onSelect={() => onScope(isActive ? 'all' : definition.scope)}
          chart={definition.scope === 'soon' && matching.length > 0 ? <UpcomingDistribution tasks={matching} today={today} /> : null} />;
      })}
    </div>
  );
}

function WorkspaceMetricCard({ definition, count, isActive, onSelect, chart }: {
  readonly definition: MetricDefinition;
  readonly count: number;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly chart: ReactNode;
}) {
  const id = useId();
  const selected = isActive ? { background: brand[100], borderColor: brand[600] } : { background: bg.surface };
  return (
    <Card size="small" className="workspace-metric" classNames={{ body: 'workspace-metric-body' }} style={selected} onClick={onSelect}>
      <Button className="workspace-metric-action" type="text" aria-labelledby={id}
        aria-describedby={`${id}-hint`} aria-pressed={isActive} />
      <div>
        <div id={id}>
          <Statistic title={<>{definition.label}{isActive ? <> <CheckOutlined aria-hidden="true" /></> : null}</>}
            value={count} suffix={<span style={{ fontSize: fontSize.meta }}>项</span>}
            styles={{ header: { paddingBlockEnd: space[0] }, title: { color: text.secondary, fontWeight: 600 },
              content: { fontSize: fontSize.metric, fontWeight: 600, lineHeight: 1.25, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' } }} />
        </div>
        <Typography.Text id={`${id}-hint`} style={{ display: 'block', color: text.secondary, fontSize: fontSize.meta, lineHeight: 1.4 }}>
          {definition.hint}
        </Typography.Text>
      </div>
      {chart}
    </Card>
  );
}

function UpcomingDistribution({ tasks, today }: { readonly tasks: readonly PersonalTask[]; readonly today: string }) {
  const days = [1, 2, 3].map((offset) => {
    const date = shiftDay(today, offset);
    return { date, count: tasks.filter((task) => task.due === date).length };
  });
  return (
    <div className="workspace-metric-chart">
      <Suspense fallback={<div style={{ blockSize: 62 }} />}>
        <WorkspaceDueChart days={days} />
      </Suspense>
    </div>
  );
}
