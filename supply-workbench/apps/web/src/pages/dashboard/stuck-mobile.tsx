import type { TableColumnType } from 'antd';
import type { ReactNode } from 'react';
import { EM_DASH, type StuckTableRow } from '../../features/performance/index.js';
import { text } from '../../theme/tokens.js';

export function mobileStuckColumns(isNarrowPhone: boolean, openBatch: (row: StuckTableRow) => ReactNode): TableColumnType<StuckTableRow>[] {
  const widths = isNarrowPhone
    ? { stage: 52, days: 32, po: 72, name: 80 }
    : { stage: 64, days: 40, po: 88, name: 100 };
  return [
    { title: '阶段', dataIndex: 'stageLabel', width: widths.stage, ellipsis: true, responsive: ['xs'] },
    {
      title: '卡了',
      dataIndex: 'daysInStage',
      width: widths.days,
      align: 'right' as const,
      responsive: ['xs'],
      render: (value: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>,
    },
    { title: '单号', width: widths.po, responsive: ['xs'], render: (_value, row) => openBatch(row) },
    { title: '品名', dataIndex: 'name', width: widths.name, ellipsis: true, responsive: ['xs'], render: (value: string) => <MobileDashText value={value} /> },
  ];
}

function MobileDashText(props: { readonly value: string }) {
  return <span style={{ color: props.value === EM_DASH ? text.tertiary : text.primary }}>{props.value}</span>;
}
