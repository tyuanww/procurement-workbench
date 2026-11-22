import {
  CalendarOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  MinusOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { Tooltip, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { KPI_COPY } from '@sw/domain';
import {
  EM_DASH,
  type BuyerBarRow,
  type BuyerSegment,
  type EmDash,
} from '../../features/performance/index.js';
import { bg, brand, fontSize, radius, space, statusColor, text } from '../../theme/tokens.js';

export function BuyerPanel(props: { readonly rows: readonly BuyerBarRow[]; readonly unassignedExceptions: number | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <BuyerHeading unassignedExceptions={props.unassignedExceptions} />
      {props.rows.map((row) => (
        <BuyerLink key={row.buyerId} row={row} />
      ))}
    </div>
  );
}

function BuyerHeading(props: { readonly unassignedExceptions: number | null }) {
  return (
    <div>
      <Typography.Title level={2} style={{ margin: 0, color: text.primary }}>
        {KPI_COPY.k8.name}
        <Tooltip title={KPI_COPY.k8.definition}>
          <InfoCircleOutlined
            aria-label={KPI_COPY.k8.definition}
            tabIndex={0}
            style={{ marginLeft: space[0], color: text.tertiary }}
          />
        </Tooltip>
      </Typography.Title>
      {props.unassignedExceptions === null ? null : <Typography.Text type="warning">未归属异常 {props.unassignedExceptions} 条，需先分配负责人</Typography.Text>}
    </div>
  );
}

function BuyerLink(props: { readonly row: BuyerBarRow }) {
  const nameColor = props.row.name === EM_DASH ? text.tertiary : brand[600];
  return (
    <a
      href={props.row.href}
      style={{
        color: text.primary,
        textDecoration: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: space[1],
      }}
    >
      <span style={{ color: nameColor, fontSize: fontSize.body }}>{props.row.name}</span>
      <BuyerBar segments={props.row.segments} />
      <BuyerLegend segments={props.row.segments} />
      <BuyerCounts row={props.row} />
    </a>
  );
}

function BuyerBar(props: { readonly segments: BuyerBarRow['segments'] }) {
  return (
    <div
      style={{
        display: 'flex',
        height: space[3],
        width: '100%',
        background: bg.page,
        borderRadius: radius,
        overflow: 'hidden',
      }}
    >
      {props.segments.map((segment) => (
        <div key={segment.id} style={segmentStyle(segment)} />
      ))}
    </div>
  );
}

function segmentStyle(segment: BuyerSegment): CSSProperties {
  const color = statusColor[segment.tone];
  const basis = {
    flexGrow: segment.count,
    flexBasis: 0,
    minWidth: 0,
    height: '100%',
    boxSizing: 'border-box' as const,
  };
  if (segment.fill === 'outline') {
    return {
      ...basis,
      background: 'transparent',
      border: segment.count === 0 ? '0 solid transparent' : `1px solid ${color.text}`,
    };
  }
  return { ...basis, background: color.text };
}

function BuyerLegend(props: { readonly segments: BuyerBarRow['segments'] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
      {props.segments.map((segment) => (
        <LegendItem key={segment.id} segment={segment} />
      ))}
    </div>
  );
}

function LegendItem(props: { readonly segment: BuyerSegment }) {
  const color = statusColor[props.segment.tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space[0],
        color: color.text,
        fontSize: fontSize.meta,
      }}
    >
      {segmentIcon(props.segment.id)}
      <span style={swatchStyle(props.segment)} />
      {props.segment.label} {props.segment.count}
    </span>
  );
}

function segmentIcon(id: BuyerSegment['id']): ReactNode {
  if (id === 'overdue') return <ClockCircleOutlined />;
  if (id === 'dueToday') return <CalendarOutlined />;
  if (id === 'missingDate') return <QuestionCircleOutlined />;
  return <MinusOutlined />;
}

function swatchStyle(segment: BuyerSegment): CSSProperties {
  const color = statusColor[segment.tone];
  const box = { width: space[2], height: space[2], borderRadius: radius, display: 'inline-block' };
  if (segment.fill === 'outline')
    return { ...box, background: 'transparent', border: `1px solid ${color.text}` };
  return { ...box, background: color.text, border: `1px solid ${color.text}` };
}

function BuyerCounts(props: { readonly row: BuyerBarRow }) {
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], fontSize: fontSize.table }}>
      <CountPair label="开放行" value={props.row.openLines} />
      <CountPair label="开放批次" value={props.row.openBatches} />
      <CountPair label="开放异常" value={props.row.openExceptions} />
      <CountPair label="跟进" value={props.row.followUpsInPeriod} />
    </span>
  );
}

function CountPair(props: { readonly label: string; readonly value: number | EmDash }) {
  const color = props.value === EM_DASH ? text.tertiary : text.primary;
  return (
    <span style={{ color: text.secondary }}>
      {props.label} <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{props.value}</span>
    </span>
  );
}
