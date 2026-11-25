import { Flex, Typography, type TableColumnsType } from 'antd';
import { Link } from 'react-router';
import type { CSSProperties, ReactNode } from 'react';
import type { OrderLineRow } from '@sw/contracts';
import { arrivalPaint, type ProgressArrival, type ProgressRow, type ProgressStay } from '../../features/progress/index.js';
import { MissingValue, StatusTag } from '../../shared/ui/widgets.js';
import { fontSize, space, statusColor, text } from '../../theme/tokens.js';
import { ProgressNextAction } from './progress-material-risk.js';
import { progressArrivalDate } from './progress-mobile.js';
import { storeLabels } from './store-query.js';

export function progressColumns(input: {
  readonly lines: ReadonlyMap<string, OrderLineRow>;
  readonly lineHref: (lineId: string) => string;
  readonly overdueHref: (row: ProgressRow) => string | undefined;
  readonly note: (lineId: string) => ReactNode;
  readonly now: Date;
}): TableColumnsType<ProgressRow> {
  return [
    { title: '品名 / 单号', key: 'identity', rowScope: 'row', render: (_value: unknown, row: ProgressRow) => (
      <Flex vertical style={{ overflowWrap: 'anywhere' }}>
        <Link to={input.lineHref(row.lineId)}>{row.title}</Link>
        <Typography.Text type="secondary">{row.po}</Typography.Text>
        <Typography.Text type="secondary">{storeLabels[input.lines.get(row.lineId)?.storeProgress?.store ?? 'unassigned']} · {row.supplierLabel}</Typography.Text>
      </Flex>
    ) },
    { title: '阶段', dataIndex: 'stageLabel', width: 96 },
    { title: '停留天数', width: 88, align: 'right', render: (_value: unknown, row: ProgressRow) => <StayDays row={row} /> },
    { title: '确认到货', width: 116, render: (_value: unknown, row: ProgressRow) => (
      <Flex vertical gap={space[0]} align="flex-start">
        {progressArrivalDate({ arrival: row.arrival, now: input.now, href: input.overdueHref(row) })}
        {row.arrival.kind === 'missing' ? null : <ArrivalTag arrival={row.arrival} />}
      </Flex>
    ) },
    { title: '下一步 / 进度说明', width: '36%', render: (_value: unknown, row: ProgressRow) => (
      <Flex vertical gap={space[0]} style={{ overflowWrap: 'anywhere' }}>
        <ProgressNextAction row={row} />
        {input.note(row.lineId)}
      </Flex>
    ) },
  ];
}

const STAY_PAINT: Record<ProgressStay, { readonly fontSize: number; readonly fontWeight: number; readonly color: string }> = {
  '0-3': { fontSize: fontSize.table, fontWeight: 400, color: text.tertiary },
  '4-7': { fontSize: fontSize.body, fontWeight: 400, color: text.secondary },
  '8-14': { fontSize: fontSize.section, fontWeight: 600, color: text.primary },
  '15+': { fontSize: fontSize.page, fontWeight: 600, color: text.primary },
};

function StayDays({ row }: { readonly row: ProgressRow }) {
  const paint = STAY_PAINT[row.stay];
  const shared: CSSProperties = {
    fontSize: paint.fontSize,
    fontWeight: paint.fontWeight,
    fontVariantNumeric: 'tabular-nums',
  };
  switch (row.arrival.kind) {
    case 'overdue':
      return (
        <span style={{ ...shared, color: statusColor.danger.text, background: statusColor.danger.bg, paddingInline: space[0] }}>
          {row.dayText}
        </span>
      );
    case 'missing':
    case 'dated':
      return <span style={{ ...shared, color: paint.color }}>{row.dayText}</span>;
    default: {
      const unchecked: never = row.arrival;
      return unchecked;
    }
  }
}

export function ArrivalTag({ arrival }: { readonly arrival: ProgressArrival }) {
  const paint = arrivalPaint(arrival.kind);
  switch (paint.kind) {
    case 'status':
      return <StatusTag status={paint.status} />;
    case 'missing':
      return <MissingValue reason={paint.reason} />;
    default: {
      const unchecked: never = paint;
      return unchecked;
    }
  }
}
