import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Descriptions, Tooltip, Typography, type TableColumnsType } from 'antd';
import type { OrderLineRow } from '@sw/contracts';
import { barcodeBase, comparableBarcode } from '@sw/domain';
import type { ProgressArrival, ProgressRow } from '../../features/progress/index.js';
import { arrivalPaint, arrivalTableDate } from '../../features/progress/index.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { MissingValue, StatusTag } from '../../shared/ui/widgets.js';
import { fontSize, space } from '../../theme/tokens.js';
import { materialRiskState, ProgressNextAction } from './progress-material-risk.js';
import type { StoreBatchFacts } from './progress-batch-facts.js';

export function progressMobileColumns(input: {
  readonly now: Date;
  readonly isNarrowPhone: boolean;
  readonly lineHref: (lineId: string) => string;
  readonly lineOf: (lineId: string) => OrderLineRow | undefined;
  readonly overdueHref: (row: ProgressRow) => string | undefined;
}): TableColumnsType<ProgressRow> {
  const widths = input.isNarrowPhone
    ? { stage: 48, days: 42, arrival: 64 }
    : { stage: 58, days: 42, arrival: 70 };
  return [
    { title: '单号 / 品名', key: 'identity', rowScope: 'row', render: (_value, row) => <MobileProduct row={row} line={input.lineOf(row.lineId)} href={input.lineHref(row.lineId)} /> },
    { title: '阶段', dataIndex: 'stageLabel', width: widths.stage, render: (_value, row) => <MobileStage row={row} /> },
    { title: <span style={{ whiteSpace: 'nowrap' }}>停留</span>, width: widths.days, align: 'right', render: (_value, row) => <span style={{ whiteSpace: 'nowrap' }}>{row.dayText}</span> },
    { title: '确认日', width: widths.arrival, render: (_value, row) => progressArrivalDate({ arrival: row.arrival, now: input.now, href: input.overdueHref(row), isPhone: true }) },
  ];
}

function MobileStage({ row }: { readonly row: ProgressRow }) {
  const short = row.stage === 'no_batch' ? '待建' : row.stage === 'awaiting_date' ? '待确认' : row.stageLabel;
  const risk = materialRiskState(row.materialRisks);
  return <>
    <Tooltip title={row.stageLabel}><span style={{ fontSize: fontSize.meta, overflowWrap: 'anywhere' }}>{short}</span></Tooltip>
    {risk === '' ? null : <Typography.Text type={risk === '物料逾期' ? 'danger' : 'secondary'} style={{ display: 'block', fontSize: fontSize.meta }}>{risk}</Typography.Text>}
  </>;
}

function MobileProduct({ row, line, href }: { readonly row: ProgressRow; readonly line: OrderLineRow | undefined; readonly href: string }) {
  const barcode = comparableBarcode(line?.barcodeRaw ?? '');
  const base = barcodeBase(barcode);
  const suffix = barcode.slice(base.length);
  return (
    <Link to={href} aria-label={`${row.po} ${row.title}${suffix === '' ? '' : ` 渠道规格 ${suffix}`}`} style={{ display: 'block', minWidth: 0 }}>
      <span title={row.po} style={{ display: 'flex', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.po.slice(0, -4)}</span>
        <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{row.po.slice(-4)}</span>
      </span>
      <span style={{ display: 'flex', gap: space[0], alignItems: 'baseline', fontWeight: 400 }}>
        <span title={row.title} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</span>
        {suffix === '' ? null : <Typography.Text type="secondary" style={{ flexShrink: 0, fontSize: fontSize.meta }}>{suffix}</Typography.Text>}
      </span>
    </Link>
  );
}

export function progressArrivalDate(input: { readonly arrival: ProgressArrival; readonly now: Date; readonly href?: string | undefined; readonly isPhone?: boolean }) {
  if (input.arrival.kind === 'missing') return <MissingValue reason="not_provided" />;
  const date = arrivalTableDate({ arrival: input.arrival, now: input.now });
  if (input.href === undefined) return <Tooltip title={input.arrival.dateText}><span style={{ overflowWrap: 'anywhere' }}>{date}</span></Tooltip>;
  return <Tooltip title={input.arrival.dateText}><Link to={input.href} aria-label={`查看逾期批次，采购确认到货日 ${input.arrival.dateText}`} style={{ overflowWrap: 'anywhere' }}>
    {date}
    {input.isPhone === true ? <Typography.Text type="danger" style={{ display: 'block', fontSize: fontSize.meta }}>逾期</Typography.Text> : null}
  </Link></Tooltip>;
}

export function progressMobileDetails({ row, line, note }: { readonly row: ProgressRow; readonly line: OrderLineRow | undefined; readonly note: ReactNode }) {
  const identity = [
    { key: 'item', label: '商品编码', children: line?.itemCodeRaw },
    { key: 'barcode', label: '商品条码', children: line?.barcodeRaw },
  ].filter(({ children }) => children != null && children.trim() !== '');
  return (
    <Descriptions size="small" column={1} styles={{ content: { overflowWrap: 'anywhere' } }} items={[
      { key: 'po', label: '完整采购单号', children: row.po },
      { key: 'name', label: '完整品名 / 规格', children: row.title },
      ...identity,
      { key: 'supplier', label: '供应商', children: row.supplierLabel },
      { key: 'stage', label: '阶段', children: row.stageLabel },
      { key: 'status', label: '状态', children: <ArrivalStatus arrival={row.arrival} /> },
      { key: 'next', label: '下一步', children: <ProgressNextAction row={row} /> },
      { key: 'note', label: '进度说明', children: note },
    ]} />
  );
}

export function StoreBatchQuantities({ facts }: { readonly facts: StoreBatchFacts | undefined }) {
  if (facts === undefined) return null;
  const unit = facts.unit;
  const quantities = [
    { key: 'unshipped', label: '未发', value: facts.unshippedQty },
    { key: 'in-transit', label: '在途', value: facts.inTransitQty },
    { key: 'received', label: '实收', value: facts.receivedQty },
  ].flatMap(({ key, label, value }) => value === null ? [] : [{ key, label, children: `${formatQuantity(value)} ${unit}` }]);
  return quantities.length === 0 ? null : <Descriptions size="small" column={{ xs: 1, sm: 3 }} title={facts.seq === null ? '下一到货批次已核实数量' : `第 ${facts.seq} 批已核实数量`} items={quantities} />;
}

function ArrivalStatus(props: { readonly arrival: ProgressRow['arrival'] }) {
  const paint = arrivalPaint(props.arrival.kind);
  return paint.kind === 'missing' ? <MissingValue reason={paint.reason} /> : <StatusTag status={paint.status} />;
}
