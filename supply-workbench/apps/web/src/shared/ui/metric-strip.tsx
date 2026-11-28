import { CheckOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Statistic, Typography } from 'antd';
import type { AriaAttributes, CSSProperties, ReactNode, Ref } from 'react';
import { bg, border, brand, fontSize, space, statusColor, text } from '../../theme/tokens.js';
import { formatQuantity } from './format.js';

export type MetricTone = 'neutral' | 'danger' | 'warning' | 'attention' | 'info' | 'success';

type MetricDialog = { readonly id: string; readonly isOpen: boolean; readonly trigger: Ref<HTMLButtonElement> };
type MetricAction = { readonly select: () => void } & (
  { readonly isActive?: boolean; readonly dialog?: never } | { readonly isActive?: never; readonly dialog: MetricDialog }
);

export type MetricItem = {
  readonly key: string;
  readonly label: string;
  readonly value: number | string;
  readonly unit?: string;
  readonly hint?: string;
  readonly tone?: MetricTone;
  readonly action?: MetricAction;
};

export function MetricStrip(input: { readonly items: readonly MetricItem[]; readonly ariaLabel: string; readonly compact?: boolean }): ReactNode {
  const isCompact = input.compact === true;
  return (
    <Row gutter={[isCompact ? space[1] : space[2], space[2]]} role="group" aria-label={input.ariaLabel}>
      {input.items.map((item) => (
        <Col key={item.key} flex={isCompact ? '1 1 0' : '1 1 min(100%, 144px)'} style={{ display: 'flex', minWidth: 0 }}>
          <MetricCard item={item} isCompact={isCompact} />
        </Col>
      ))}
    </Row>
  );
}

function MetricCard(input: { readonly item: MetricItem; readonly isCompact: boolean }): ReactNode {
  if (input.item.action !== undefined) return <MetricButton item={input.item} action={input.item.action} isCompact={input.isCompact} />;
  return (
    <Card size="small" styles={{ body: { padding: `var(--metric-padding, ${space[2]}px)` } }} style={{ width: '100%', borderTop: metricBorder(input.item) }}>
      <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{input.item.label}</Typography.Text>
      <Statistic value={input.item.value} suffix={input.item.unit} styles={{ content: metricValueStyle() }} />
      {input.item.hint === undefined ? null : <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{input.item.hint}</Typography.Text>}
    </Card>
  );
}

function MetricButton({ item, action, isCompact }: { readonly item: MetricItem; readonly action: MetricAction; readonly isCompact: boolean }): ReactNode {
  const { dialog } = action;
  const isActive = dialog?.isOpen ?? action.isActive;
  return (
    <Button block ref={dialog?.trigger} {...metricButtonSemantics(action)} onClick={action.select} style={{
      display: 'block', height: 'auto', whiteSpace: 'normal', textAlign: 'start', padding: `var(--metric-padding, ${isCompact ? space[1] : space[2]}px)`,
      borderTop: metricBorder(item),
      ...metricSelectionStyle(isActive === true),
    }}>
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span style={{ color: text.secondary, fontSize: fontSize.meta }}>{item.label}{isActive ? <> <CheckOutlined aria-hidden="true" /></> : null}</span>
        <strong style={isCompact ? { ...metricValueStyle(), overflowWrap: 'anywhere' } : metricValueStyle()}>
          {typeof item.value === 'number' ? formatQuantity(item.value) : item.value}
          {isCompact ? <span style={{ fontSize: fontSize.meta }}>{item.unit}</span> : item.unit}
        </strong>
        {item.hint === undefined ? null : <span style={{ color: text.secondary, fontSize: fontSize.meta }}>{item.hint}</span>}
      </span>
    </Button>
  );
}

function metricButtonSemantics({ dialog, isActive }: MetricAction): AriaAttributes {
  if (dialog === undefined) return { 'aria-pressed': isActive };
  return { 'aria-haspopup': 'dialog', 'aria-expanded': dialog.isOpen, 'aria-controls': dialog.isOpen ? dialog.id : undefined };
}

function metricSelectionStyle(isActive: boolean): CSSProperties {
  const outline = isActive ? brand[600] : border;
  return { background: isActive ? brand[100] : bg.surface, borderInlineColor: outline, borderBottomColor: outline };
}

export function toneColor(tone: MetricTone | undefined): string {
  return statusColor[tone ?? 'neutral'].text;
}

function metricBorder(item: MetricItem): string {
  const hasAccent = item.tone !== undefined && item.tone !== 'neutral' && item.value !== 0;
  return `2px solid ${hasAccent ? toneColor(item.tone) : border}`;
}

function metricValueStyle(): CSSProperties {
  return { fontSize: fontSize.metric, lineHeight: 1.25, color: text.primary, fontVariantNumeric: 'tabular-nums' };
}
