import { Descriptions, type TableColumnType } from 'antd';
import { EM_DASH, type StuckTableRow } from '../../features/performance/index.js';
import { formatTableDate } from '../../shared/ui/format.js';
import { text } from '../../theme/tokens.js';

export function mobileStuckColumns(isNarrowPhone: boolean): TableColumnType<StuckTableRow>[] {
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
    { title: '单号', dataIndex: 'po', width: widths.po, ellipsis: true, responsive: ['xs'], render: (value: string) => <MobileDashText value={value} /> },
    { title: '品名', dataIndex: 'name', width: widths.name, ellipsis: true, responsive: ['xs'], render: (value: string) => <MobileDashText value={value} /> },
  ];
}

export function mobileStuckRowDetails(row: StuckTableRow, now: Date) {
  return (
    <Descriptions
      size="small"
      column={1}
      items={[
        { key: 'waiting', label: '等待方', children: <MobileDashText value={row.waiting} /> },
        { key: 'owner', label: '负责人', children: <MobileDashText value={row.owner} /> },
        { key: 'confirmed', label: '确认到货', children: <MobileDashText value={confirmedText(row.confirmed, now)} /> },
      ]}
    />
  );
}

function confirmedText(value: string, now: Date): string {
  return value === EM_DASH ? value : formatTableDate({ iso: value, now });
}

function MobileDashText(props: { readonly value: string }) {
  return <span style={{ color: props.value === EM_DASH ? text.tertiary : text.primary }}>{props.value}</span>;
}
