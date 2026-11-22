import { InfoCircleOutlined } from '@ant-design/icons';
import { Table, Tooltip, type TableColumnType } from 'antd';
import type { MouseEvent } from 'react';
import { KPI_COPY } from '@sw/domain';
import {
  EM_DASH,
  type SupplierCell,
  type SupplierColumnKey,
  type SupplierTableRow,
} from '../../features/performance/index.js';
import { brand, fontSize, space, text } from '../../theme/tokens.js';

const COLUMN_KEYS: readonly SupplierColumnKey[] = [
  'dueBatches',
  'onTime',
  'averageDelayDays',
  'overdueNow',
  'dateChanges',
  'noteReturnDays',
  'openExceptions',
];

const SUPPLIER_COPY = {
  dueBatches: KPI_COPY.k1,
  onTime: KPI_COPY.k2,
  averageDelayDays: KPI_COPY.k3,
  overdueNow: KPI_COPY.k4,
  dateChanges: KPI_COPY.k5,
  noteReturnDays: KPI_COPY.k6,
  openExceptions: KPI_COPY.k7,
} satisfies Record<SupplierColumnKey, { readonly name: string; readonly definition: string }>;

export function SupplierPanel(props: { readonly rows: readonly SupplierTableRow[] }) {
  return (
    <Table<SupplierTableRow>
      size="small"
      pagination={false}
      rowKey="partyId"
      columns={supplierColumns()}
      dataSource={[...props.rows]}
      scroll={{ x: 'max-content' }}
      onRow={(row) => ({
        onClick: (event) => openParty(event, row.href),
        style: { cursor: 'pointer' },
      })}
    />
  );
}

function supplierColumns(): TableColumnType<SupplierTableRow>[] {
  return [nameColumn(), ...COLUMN_KEYS.map(kpiColumn), weekColumn()];
}

function nameColumn(): TableColumnType<SupplierTableRow> {
  return { title: '主体', dataIndex: 'name', render: (_value, row) => <PartyName row={row} /> };
}

function kpiColumn(key: SupplierColumnKey): TableColumnType<SupplierTableRow> {
  return {
    title: <KpiTitle column={key} />,
    align: 'right',
    render: (_value, row) => <KpiCell row={row} column={key} />,
  };
}

function weekColumn(): TableColumnType<SupplierTableRow> {
  return { title: '近 8 周', render: (_value, row) => <WeekCells weeks={row.weeks} /> };
}

function KpiTitle(props: { readonly column: SupplierColumnKey }) {
  const copy = SUPPLIER_COPY[props.column];
  return (
    <span>
      {copy.name}
      <Tooltip title={copy.definition}>
        <InfoCircleOutlined
          aria-label={copy.definition}
          tabIndex={0}
          style={{ marginLeft: space[0], color: text.tertiary }}
        />
      </Tooltip>
    </span>
  );
}

function PartyName(props: { readonly row: SupplierTableRow }) {
  const color = props.row.name === EM_DASH ? text.tertiary : brand[600];
  return (
    <a href={props.row.href} style={{ color }}>
      {props.row.name}
    </a>
  );
}

function openParty(event: MouseEvent<HTMLElement>, href: string): void {
  if (event.target instanceof Element && event.target.closest('a') !== null) return;
  window.location.assign(href);
}

function KpiCell(props: { readonly row: SupplierTableRow; readonly column: SupplierColumnKey }) {
  const cell = props.row.cells.find((item) => item.key === props.column);
  if (cell === undefined) return <span style={{ color: text.tertiary }}>{EM_DASH}</span>;
  return (
    <span style={{ color: cellColor(cell.tone), fontVariantNumeric: 'tabular-nums' }}>
      {displayText(props.column, cell)}
    </span>
  );
}

function WeekCells(props: { readonly weeks: SupplierTableRow['weeks'] }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: space[1],
        fontVariantNumeric: 'tabular-nums',
        fontSize: fontSize.meta,
      }}
    >
      {props.weeks.map((week) => (
        <span
          key={week.weekStart}
          style={{ color: week.tone === 'missing' ? text.tertiary : text.primary }}
        >
          {week.text}
        </span>
      ))}
    </span>
  );
}

function displayText(column: SupplierColumnKey, cell: SupplierCell): string {
  if (cell.tone === 'missing') return cell.text;
  if (column === 'averageDelayDays' || column === 'noteReturnDays') return `${cell.text} 天`;
  return cell.text;
}

function cellColor(tone: SupplierCell['tone']): string {
  if (tone === 'sample') return text.secondary;
  if (tone === 'missing') return text.tertiary;
  return text.primary;
}
