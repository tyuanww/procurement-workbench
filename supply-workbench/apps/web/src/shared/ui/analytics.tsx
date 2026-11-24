import { CheckOutlined } from '@ant-design/icons';
import { Button, Card, Progress, Statistic, Typography } from 'antd';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { bg, border, brand, controlBorder, fontSize, radius, space, statusColor, text } from '../../theme/tokens.js';
import { formatQuantity } from './format.js';

export type MetricTone = 'neutral' | 'danger' | 'warning' | 'attention' | 'info' | 'success';

export type MetricItem = {
  readonly key: string;
  readonly label: string;
  readonly value: number | string;
  readonly unit?: string;
  readonly hint?: string;
  readonly tone?: MetricTone;
  readonly action?: { readonly isActive?: boolean; readonly select: () => void };
};

export type BarSegment = {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly tone?: MetricTone;
  readonly fill?: string;
  readonly isActive?: boolean;
};

export type BarRow = {
  readonly key: string;
  readonly label: string;
  readonly segments: readonly BarSegment[];
  readonly total?: number;
  readonly onSelect?: (segmentKey: string) => void;
};

type BarLineProps = { readonly row: BarRow; readonly total: number; readonly scaleMax: number };

const labeledBarCss = `.stacked-bar-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:${space[1]}px;margin-block-start:${space[1]}px}
@container stacked-bar (min-width: 456px){.stacked-bar-values{grid-template-columns:repeat(4,minmax(0,1fr))}}`;

export function MetricStrip(input: { readonly items: readonly MetricItem[]; readonly ariaLabel: string }): ReactNode {
  return (
    <div role="group" aria-label={input.ariaLabel} style={metricGridStyle()}>
      {input.items.map((item) => <MetricCard key={item.key} item={item} />)}
    </div>
  );
}

function MetricCard(input: { readonly item: MetricItem }): ReactNode {
  if (input.item.action !== undefined) return <MetricButton item={input.item} action={input.item.action} />;
  return (
    <Card size="small" styles={{ body: { padding: space[2] } }} style={{ borderTop: `2px solid ${toneColor(input.item.tone)}` }}>
      <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{input.item.label}</Typography.Text>
      <Statistic value={input.item.value} suffix={input.item.unit} styles={{ content: metricValueStyle() }} />
      {input.item.hint === undefined ? null : <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{input.item.hint}</Typography.Text>}
    </Card>
  );
}

function MetricButton({ item, action }: { readonly item: MetricItem; readonly action: NonNullable<MetricItem['action']> }): ReactNode {
  return (
    <Button block aria-pressed={action.isActive} onClick={action.select} style={{
      display: 'block', height: 'auto', whiteSpace: 'normal', textAlign: 'start', padding: space[2],
      borderTop: `2px solid ${toneColor(item.tone)}`,
      background: action.isActive ? brand[100] : bg.surface,
      borderInlineColor: action.isActive ? brand[600] : border, borderBottomColor: action.isActive ? brand[600] : border,
    }}>
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span style={{ color: text.secondary, fontSize: fontSize.meta }}>{item.label}{action.isActive ? <> <CheckOutlined aria-hidden="true" /></> : null}</span>
        <strong style={metricValueStyle()}>{typeof item.value === 'number' ? formatQuantity(item.value) : item.value}{item.unit}</strong>
        {item.hint === undefined ? null : <span style={{ color: text.secondary, fontSize: fontSize.meta }}>{item.hint}</span>}
      </span>
    </Button>
  );
}

export function StackedBarChart(input: {
  readonly rows: readonly BarRow[];
  readonly ariaLabel: string;
  readonly scale?: 'count' | 'composition';
  readonly showValues?: boolean;
}): ReactNode {
  const rows = input.rows.map((row) => ({
    row, total: row.total ?? row.segments.reduce((sum, segment) => sum + segment.value, 0),
  }));
  const sharedMax = input.scale === 'count' ? Math.max(0, ...rows.map(({ total }) => total)) : undefined;
  const Line = input.showValues === true ? LabeledBarLine : BarLine;
  return (
    <div role="group" aria-label={input.ariaLabel} style={{
      display: 'flex', flexDirection: 'column', gap: space[1],
      container: input.showValues === true ? 'stacked-bar / inline-size' : undefined,
    }}>
      {input.showValues === true ? <style>{labeledBarCss}</style> : null}
      {rows.map(({ row, total }) => <Line key={row.key} row={row} total={total} scaleMax={sharedMax ?? total} />)}
      {input.showValues === true ? null : <BarLegend rows={input.rows} />}
    </div>
  );
}

export function RateBars(input: { readonly rows: readonly { readonly key: string; readonly label: string; readonly rate: number; readonly hint?: string }[]; readonly ariaLabel: string }): ReactNode {
  return (
    <div role="group" aria-label={input.ariaLabel} style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      {input.rows.map((row) => (
        <div key={row.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 180px) minmax(0, 1fr) 52px', gap: space[1], alignItems: 'center' }}>
          <Typography.Text ellipsis={{ tooltip: row.hint }} style={{ fontSize: fontSize.table }}>{row.label}</Typography.Text>
          <Progress aria-hidden="true" percent={Math.max(0, Math.min(1, row.rate)) * 100} showInfo={false}
            status="normal" size={['100%', 12]} strokeColor={rateTone(row.rate)} railColor={statusColor.neutral.bg} />
          <Typography.Text style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: fontSize.table }}>{Math.round(row.rate * 100)}%</Typography.Text>
        </div>
      ))}
    </div>
  );
}

export function Sparkline(input: { readonly values: readonly (number | null)[]; readonly labels?: readonly string[]; readonly ariaLabel: string }): ReactNode {
  const values = input.values.filter((value) => value !== null);
  if (values.length === 0) return <Typography.Text type="secondary">—</Typography.Text>;
  const max = Math.max(1, ...values);
  const step = 100 / Math.max(1, input.values.length - 1);
  const points = input.values.map((value, index) => value === null ? null : { value, index });
  const path = points.flatMap((point, index) => point === null ? [] : [
    `${points[index - 1] == null ? 'M' : 'L'}${point.index * step},${31 - (point.value / max) * 27}`,
  ]).join(' ');
  return (
    <svg viewBox="0 0 100 32" role="img" aria-label={input.ariaLabel} style={{ width: '100%', height: 92, overflow: 'visible' }}>
      <line x1="0" y1="31" x2="100" y2="31" stroke={border} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={path} fill="none" stroke={brand[600]} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {points.map((point) => point === null ? null : (
        <circle key={point.index} cx={point.index * step} cy={31 - (point.value / max) * 27} r="0.9" fill={brand[600]}>
          <title>{tooltipOf(point, input.labels)}</title>
        </circle>
      ))}
    </svg>
  );
}

function BarLine({ row, total, scaleMax }: BarLineProps): ReactNode {
  const [segment] = row.segments;
  if (row.onSelect !== undefined && segment !== undefined && row.segments.length === 1) {
    return <SingleBarButton segment={segment} scaleMax={scaleMax} onSelect={row.onSelect} />;
  }
  return (
    <div style={barLineStyle()}>
      <Typography.Text style={{ fontSize: fontSize.table, color: text.secondary }}>{row.label}</Typography.Text>
      {total <= 0 ? <div style={emptyTrackStyle()} /> : <BarTrack row={row} scaleMax={scaleMax} />}
      <Typography.Text style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: fontSize.table }}>{total}</Typography.Text>
    </div>
  );
}

function SingleBarButton({ segment, scaleMax, onSelect }: { readonly segment: BarSegment; readonly scaleMax: number; readonly onSelect: NonNullable<BarRow['onSelect']> }): ReactNode {
  const count = formatQuantity(segment.value);
  const isActive = segment.isActive === true;
  return (
    <Button block type="text" title={`${segment.label} ${count}`} aria-pressed={isActive} onClick={() => onSelect(segment.key)}
      style={{ display: 'block', minHeight: 44, height: 'auto', paddingInline: space[1], textAlign: 'start', whiteSpace: 'normal', borderColor: isActive ? brand[600] : 'transparent', background: isActive ? brand[100] : undefined }}>
      <span style={barLineStyle()}>
        <span style={{ color: text.secondary }}>{segment.label}</span>
        <span aria-hidden="true" style={trackStyle()}>
          <span style={{ width: `${scaleMax <= 0 ? 0 : (segment.value / scaleMax) * 100}%`, background: segmentColor(segment) }} />
        </span>
        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </span>
    </Button>
  );
}

function LabeledBarLine({ row, total, scaleMax }: BarLineProps): ReactNode {
  const id = useId();
  return (
    <div style={{ background: bg.surface, border: `1px solid ${border}`, borderRadius: radius, padding: space[1] }}>
      <div style={barLineStyle()}>
        <Typography.Text style={{ fontSize: fontSize.table, color: text.secondary }}>{row.label}</Typography.Text>
        {total <= 0 ? <div style={emptyTrackStyle()} /> : <LabeledBarTrack row={row} total={total} scaleMax={scaleMax} id={id} />}
        <Typography.Text style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: fontSize.table }}>
          {formatQuantity(total)}
        </Typography.Text>
      </div>
      <div className="stacked-bar-values">
        {row.segments.map((segment) => (
          <SegmentValue key={segment.key} segment={segment} id={`${id}-${segment.key}`} row={row} />
        ))}
      </div>
    </div>
  );
}

function LabeledBarTrack({ row, total, scaleMax, id }: BarLineProps & { readonly id: string }): ReactNode {
  const segments = row.segments.filter((segment) => segment.value > 0);
  return (
    <div aria-hidden="true" style={{
      ...trackStyle(), display: 'grid', width: `${(total / scaleMax) * 100}%`, height: 12,
      gridTemplateColumns: segments.map((segment) => `minmax(0, ${segment.value}fr)`).join(' '), gap: 2, background: bg.surface,
    }}>
      {segments.map((segment) => {
        const title = `${segment.label} ${formatQuantity(segment.value)}`;
        const style = { background: segmentColor(segment) };
        return row.onSelect === undefined
          ? <span key={segment.key} title={title} style={style} />
          : <label key={segment.key} htmlFor={`${id}-${segment.key}`} title={title} style={{ ...style, cursor: 'pointer' }} />;
      })}
    </div>
  );
}

function SegmentValue({ segment, id, row }: { readonly segment: BarSegment; readonly id: string; readonly row: BarRow }): ReactNode {
  const onSelect = row.onSelect;
  const value = formatQuantity(segment.value);
  const content = (
    <span style={{ display: 'flex', alignItems: 'center', gap: space[1], flex: 1 }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: segmentColor(segment) }} />
      <span>{segment.label}</span>
      <strong style={{ fontVariantNumeric: 'tabular-nums', marginInlineStart: 'auto' }}>{value}</strong>
    </span>
  );
  const style: CSSProperties = { display: 'flex', alignItems: 'center', gap: space[0], paddingInline: space[1], fontSize: fontSize.meta, color: text.primary };
  if (onSelect === undefined) return <span style={style}>{content}</span>;
  return (
    <Button id={id} aria-label={`${row.label}，${segment.label} ${value}`} aria-pressed={segment.isActive}
      icon={segment.isActive === true ? <CheckOutlined aria-hidden="true" /> : undefined}
      onClick={() => onSelect(segment.key)}
      style={{
        ...style, minHeight: 44, height: 'auto', whiteSpace: 'normal',
        borderColor: segment.isActive === true ? brand[600] : controlBorder,
        background: segment.isActive === true ? brand[100] : bg.surface,
      }}
    >
      {content}
    </Button>
  );
}

function BarTrack({ row, scaleMax }: { readonly row: BarRow; readonly scaleMax: number }): ReactNode {
  return (
    <div style={trackStyle()}>
      {row.segments.filter((segment) => segment.value > 0).map((segment) => (
        <BarBlock key={segment.key} segment={segment} scaleMax={scaleMax} rowLabel={row.label} onSelect={row.onSelect} />
      ))}
    </div>
  );
}

function BarBlock({ segment, scaleMax, rowLabel, onSelect }: {
  readonly segment: BarSegment;
  readonly scaleMax: number;
  readonly rowLabel: string;
  readonly onSelect: BarRow['onSelect'];
}): ReactNode {
  const style: CSSProperties = {
    width: `${(segment.value / scaleMax) * 100}%`,
    height: '100%',
    border: 0,
    padding: 0,
    background: segmentColor(segment),
    opacity: segment.isActive === false ? 0.45 : 0.9,
    cursor: onSelect === undefined ? 'default' : 'pointer',
  };
  const label = `${segment.label} ${segment.value}`;
  if (onSelect === undefined) return <span title={label} style={style} />;
  return <Button type="text" aria-label={`${rowLabel}，${label}`} aria-pressed={segment.isActive} title={label}
    onClick={() => onSelect(segment.key)} style={{ ...style, outlineOffset: -2 }} />;
}

function BarLegend(input: { readonly rows: readonly BarRow[] }): ReactNode {
  const labels = new Map<string, BarSegment>();
  for (const row of input.rows) for (const segment of row.segments) labels.set(segment.key, segment);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], marginTop: space[1] }}>
      {[...labels.values()].map((segment) => (
        <span key={segment.key} style={{ display: 'inline-flex', alignItems: 'center', gap: space[0], color: text.secondary, fontSize: fontSize.meta }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: segmentColor(segment) }} />
          {segment.label}
        </span>
      ))}
    </div>
  );
}

function tooltipOf(point: { readonly index: number; readonly value: number }, labels: readonly string[] | undefined): string {
  const label = labels?.[point.index];
  return label === undefined ? String(point.value) : `${label} ${point.value}`;
}

function toneColor(tone: MetricTone | undefined): string {
  return statusColor[tone ?? 'neutral'].text;
}

function segmentColor(segment: BarSegment): string {
  return segment.fill ?? toneColor(segment.tone);
}

function rateTone(rate: number): string {
  if (rate >= 0.95) return statusColor.success.text;
  if (rate >= 0.8) return statusColor.warning.text;
  return statusColor.danger.text;
}

function metricGridStyle(): CSSProperties {
  return { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: space[2] };
}

function metricValueStyle(): CSSProperties {
  return { fontSize: fontSize.page, color: text.primary, fontVariantNumeric: 'tabular-nums' };
}

function barLineStyle(): CSSProperties {
  return { display: 'grid', gridTemplateColumns: 'minmax(64px, 112px) minmax(0, 1fr) 44px', gap: space[1], alignItems: 'center' };
}

function trackStyle(): CSSProperties {
  return { display: 'flex', height: 16, borderRadius: radius, overflow: 'hidden', background: statusColor.neutral.bg };
}

function emptyTrackStyle(): CSSProperties {
  return { height: 16, borderRadius: radius, background: bg.page, border: `1px dashed ${border}` };
}
