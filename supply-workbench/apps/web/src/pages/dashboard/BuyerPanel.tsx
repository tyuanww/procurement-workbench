import { ClockCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Button, Tooltip, Typography } from 'antd';
import { useId, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { KPI_COPY } from '@sw/domain';
import { EM_DASH, type BuyerBarRow, type BuyerDrillSelection, type DashboardLane, type EmDash } from '../../features/performance/index.js';
import { bg, brand, fontSize, radius, space, statusColor, text } from '../../theme/tokens.js';
import { BuyerDrillDrawer } from './BuyerDrillDrawer.js';

export function BuyerPanel(props: {
  readonly rows: readonly BuyerBarRow[];
  readonly unassignedExceptions: number | null;
  readonly lane: DashboardLane;
}) {
  const [drill, setDrill] = useState<{ readonly selection: BuyerDrillSelection; readonly isOpen: boolean } | null>(null);
  const open = (selection: BuyerDrillSelection) => setDrill({ selection, isOpen: true });
  const max = props.rows.reduce((highest, row) => Math.max(highest, row.openBatches), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <BuyerHeading count={props.unassignedExceptions} onDrill={() => open({ kind: 'unassigned-exceptions' })} />
      {props.rows.map((row) => (
        <BuyerRow key={row.buyerId} row={row} max={max} onDrill={() => open({ kind: 'overdue', buyerId: row.buyerId, buyerName: row.name, lane: props.lane })} />
      ))}
      {drill === null ? null : <BuyerDrillDrawer selection={drill.selection} isOpen={drill.isOpen}
        onClose={() => setDrill({ ...drill, isOpen: false })} onHidden={() => setDrill(null)} />}
    </div>
  );
}

function BuyerHeading({ count, onDrill }: { readonly count: number | null; readonly onDrill: () => void }) {
  return (
    <div>
      <Typography.Title level={2} style={{ margin: 0, color: text.primary }}>
        {KPI_COPY.k8.name}
        <Tooltip title={KPI_COPY.k8.definition}>
          <InfoCircleOutlined aria-label={KPI_COPY.k8.definition} tabIndex={0} style={{ marginLeft: space[0], color: text.tertiary }} />
        </Tooltip>
      </Typography.Title>
      {count === null ? <Typography.Text type="secondary">未归属异常 —</Typography.Text> :
        count > 0 ? <Button type="link" onClick={onDrill} style={{ paddingInline: 0 }}>未归属异常 {count} 条</Button> :
          <Typography.Text type="secondary">未归属异常 0 条</Typography.Text>}
    </div>
  );
}

function BuyerRow({ row, max, onDrill }: { readonly row: BuyerBarRow; readonly max: number; readonly onDrill: () => void }) {
  const drillId = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      <Link to={row.href} style={{ color: brand[600], fontSize: fontSize.body }} aria-label={`${row.name}的订单行`}>{row.name}</Link>
      <BuyerBar row={row} max={max} drillId={drillId} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
        <CountPair label="开放批次" value={row.openBatches} />
        {row.overdue === 0 ? <CountPair label="逾期" value={0} /> :
          <Button id={drillId} type="link" icon={<ClockCircleOutlined />} aria-label={`${row.name}，逾期 ${row.overdue} 批`}
            onClick={onDrill} style={{ color: statusColor.danger.text, paddingInline: 0 }}>逾期 {row.overdue} 批</Button>}
      </div>
      <BuyerCounts row={row} />
    </div>
  );
}

const barStyle: CSSProperties = { display: 'flex', height: space[3], borderRadius: radius, background: bg.page };

function BuyerBar({ row, max, drillId }: { readonly row: BuyerBarRow; readonly max: number; readonly drillId: string }) {
  return (
    <div aria-hidden="true" style={barStyle}>
      <div style={{ ...barStyle, width: `${row.openBatches / max * 100}%`, background: statusColor.neutral.border, overflow: 'hidden' }}>
        {row.overdue > 0 && <label htmlFor={drillId} title={`逾期 ${row.overdue} 批`}
          style={{ flexGrow: row.overdue, flexBasis: 0, background: statusColor.danger.text, cursor: 'pointer' }} />}
        <span style={{ flexGrow: row.openBatches - row.overdue, flexBasis: 0 }} />
      </div>
    </div>
  );
}

function BuyerCounts({ row }: { readonly row: BuyerBarRow }) {
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], fontSize: fontSize.table }}>
      <CountPair label="在跟订单行" value={row.openLines} />
      <CountPair label="今日应到" value={row.dueToday} />
      <CountPair label="缺确认日期" value={row.missingDate} />
      <CountPair label="开放异常" value={row.openExceptions} />
      <CountPair label="跟进" value={row.followUpsInPeriod} />
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
