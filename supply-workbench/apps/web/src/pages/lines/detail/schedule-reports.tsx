import { Typography } from 'antd';
import { linkStatusLabel, scheduleBalance, scheduledDayQty, SCHEDULE_LINK_REVIEW } from '@sw/domain';
import type { OrderLineDetail } from '@sw/contracts';

type ScheduleRow = OrderLineDetail['factoryReports']['schedule'][number];

export function ScheduleReports(props: { readonly rows: readonly ScheduleRow[]; readonly ordered: number | null; readonly shipped: number | null; readonly received: number | null }) {
  if (props.rows.length === 0) return null;
  const balance = scheduleBalance({
    ordered: props.ordered,
    scheduled: scheduledDayQty(props.rows.map((row) => ({ linkStatus: row.linkStatus, qty: row.payload.qty }))),
    shipped: props.shipped,
    received: props.received,
  });
  return (
    <div>
      <Typography.Title level={2}>排产</Typography.Title>
      <p>{balanceText(balance)}</p>
      <ul>{props.rows.map((row) => <li key={row.id}>{scheduleLineText(row)}</li>)}</ul>
    </div>
  );
}

export function scheduleLineText(row: ScheduleRow): string {
  const risk = row.linkReason === SCHEDULE_LINK_REVIEW ? '仍关联但待复核' : '';
  return [String(row.payload.day), qtyText(row.payload.qty), poText(row.payload.po), linkStatusLabel(row.linkStatus), risk].filter((part) => part !== '').join(' · ');
}

export function balanceText(balance: { readonly ordered: number | null; readonly scheduled: number | null; readonly shipped: number | null; readonly received: number | null; readonly over: boolean }): string {
  const text = `总需求 ${amount(balance.ordered)} · 已排产 ${amount(balance.scheduled)} · 已发货 ${amount(balance.shipped)} · 已收货 ${amount(balance.received)}`;
  return balance.over ? `${text} · 超量` : text;
}

function qtyText(qty: number | null): string {
  return qty === null ? '数量未填' : String(qty);
}

function poText(po: ScheduleRow['payload']['po']): string {
  const raw = po.value?.poRaw ?? po.raw;
  if (raw === null || raw === '') return '无单号';
  return raw;
}

function amount(value: number | null): string {
  return value === null ? '空' : String(value);
}
