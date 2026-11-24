import { ClockCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Button, Descriptions, Flex, Progress, Table, Tooltip, Typography, type TableColumnsType } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router';
import { KPI_COPY } from '@sw/domain';
import { type BuyerBarRow, type BuyerDrillSelection, type DashboardLane } from '../../features/performance/index.js';
import { useShellViewport } from '../../features/shell/index.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { statusColor, text } from '../../theme/tokens.js';
import { BuyerDrillDrawer } from './BuyerDrillDrawer.js';

type LoadFields = 'openLines' | 'dueToday' | 'missingDate' | 'openExceptions' | 'followUpsInPeriod';

const DETAIL_FIELDS: readonly { readonly title: string; readonly dataIndex: LoadFields }[] = [
  { title: '在跟订单行', dataIndex: 'openLines' },
  { title: '今日应到', dataIndex: 'dueToday' },
  { title: '缺确认日期', dataIndex: 'missingDate' },
  { title: '开放异常', dataIndex: 'openExceptions' },
  { title: '跟进', dataIndex: 'followUpsInPeriod' },
];

export function BuyerPanel(props: {
  readonly rows: readonly BuyerBarRow[];
  readonly unassignedExceptions: number | null;
  readonly lane: DashboardLane;
}) {
  const isPhone = useShellViewport().band === 'phone';
  const [drill, setDrill] = useState<{ readonly selection: BuyerDrillSelection; readonly isOpen: boolean } | null>(null);
  const open = (selection: BuyerDrillSelection) => setDrill({ selection, isOpen: true });
  const max = props.rows.reduce((highest, row) => Math.max(highest, row.openBatches), 1);
  const columns = loadColumns(max, (row) => open({ kind: 'overdue', buyerId: row.buyerId, buyerName: row.name, lane: props.lane }));
  return (
    <SectionGroup title={KPI_COPY.k8.name} meta={`${props.rows.length} 位负责人`}>
      <Flex vertical gap="small">
        <Flex align="center" wrap gap="small">
          <BuyerUnassigned count={props.unassignedExceptions} onDrill={() => open({ kind: 'unassigned-exceptions' })} />
          <Tooltip title={KPI_COPY.k8.definition} trigger={['hover', 'focus']}>
            <Button type="text" size="small" icon={<InfoCircleOutlined />} aria-label="采购负荷统计口径" />
          </Tooltip>
        </Flex>
        <Table<BuyerBarRow>
          size="small"
          rowKey="buyerId"
          dataSource={props.rows}
          columns={isPhone ? columns : [...columns, ...DETAIL_FIELDS.map((field) => ({ ...field, align: 'right' as const }))]}
          locale={{ emptyText: '所选范围内暂无已分配负责人的批次' }}
          pagination={{ defaultPageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
          {...(isPhone ? { expandable: { expandedRowRender: buyerDetails } } : { scroll: { x: 'max-content' } })}
        />
      </Flex>
      {drill === null ? null : <BuyerDrillDrawer selection={drill.selection} isOpen={drill.isOpen}
        onClose={() => setDrill({ ...drill, isOpen: false })} onHidden={() => setDrill(null)} />}
    </SectionGroup>
  );
}

function BuyerUnassigned({ count, onDrill }: { readonly count: number | null; readonly onDrill: () => void }) {
  if (count !== null && count > 0) {
    return <Button type="link" onClick={onDrill} style={{ paddingInline: 0 }}>未归属异常 {count} 条</Button>;
  }
  return <Typography.Text type="secondary">未归属异常 {count === null ? '—' : '0 条'}</Typography.Text>;
}

function loadColumns(max: number, onDrill: (row: BuyerBarRow) => void): TableColumnsType<BuyerBarRow> {
  return [
    { title: '负责人', dataIndex: 'name', rowScope: 'row', render: (name: string, row) =>
      <Link to={row.href} style={{ overflowWrap: 'anywhere' }} aria-label={`${name}的订单行`}>{name}</Link> },
    { title: '开放批次', dataIndex: 'openBatches', align: 'right', render: (value: number) => <Flex align="end" vertical>
      <Typography.Text style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Typography.Text>
      <div aria-hidden="true" style={{ width: '100%', minWidth: 42, lineHeight: 0 }}>
        <Progress percent={value / max * 100} strokeColor={statusColor.info.text} showInfo={false} size="small" />
      </div>
    </Flex> },
    { title: '逾期批次', dataIndex: 'overdue', align: 'right', render: (value: number, row) => value === 0
      ? <Typography.Text type="secondary">0</Typography.Text>
      : <Button type="link" size="small" icon={<ClockCircleOutlined />} aria-label={`${row.name}，逾期 ${value} 批`}
        onClick={() => onDrill(row)} style={{ color: statusColor.danger.text, paddingInline: 0 }}>{value}</Button> },
  ];
}

function buyerDetails(row: BuyerBarRow) {
  return <Descriptions size="small" column={1} items={DETAIL_FIELDS.map(({ title, dataIndex }) => ({
    key: dataIndex, label: title, children: <Typography.Text style={{ color: text.primary }}>{row[dataIndex]}</Typography.Text>,
  }))} />;
}
