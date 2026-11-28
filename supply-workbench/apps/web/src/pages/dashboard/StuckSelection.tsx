import { Alert, Button, Descriptions, Drawer, Flex, Tag, Typography } from 'antd';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { StuckDashboard, StuckItem } from '@sw/contracts';
import { EM_DASH, STUCK_BATCH_PARAM, STUCK_RETURN_PARAM, stuckOrderFocus, stuckReturnAddress, type StuckTableRow } from '../../features/performance/index.js';
import { useCan } from '../../shared/actor.js';
import { useDetailFocusLink, useDetailReturnFocus } from '../../shared/hooks/detail-return-focus.js';
import { formatQuantity, formatTableDate } from '../../shared/ui/format.js';
import { drawerWidth, space } from '../../theme/tokens.js';
import { CAUSE_LABEL } from './cause-filter.js';

const WAITING_REASON = {
  supplier_date: '跟进确认交期',
  supplier_shipment: '等工厂发货',
  internal_note: '等回单',
  internal_review: '待核实物记录',
  receiver_arrival: '等收货',
} satisfies Record<NonNullable<StuckItem['waitingOn']['reason']>, string>;

export function stuckTriggerId(batchId: string) {
  return `stuck-batch:${batchId}`;
}

export function useStuckSelection(list: RefObject<HTMLElement | null>) {
  const [params, setParams] = useSearchParams();
  const batchId = params.get(STUCK_BATCH_PARAM);
  const last = useRef(batchId);
  useEffect(() => {
    const prior = last.current;
    last.current = batchId;
    if (prior === null || batchId !== null) return;
    const frame = window.requestAnimationFrame(() => (document.getElementById(stuckTriggerId(prior)) ?? list.current)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [batchId, list]);
  return { batchId, select(id: string | null) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (id === null) next.delete(STUCK_BATCH_PARAM);
      else next.set(STUCK_BATCH_PARAM, id);
      return next;
    }, { replace: true, preventScrollReset: true });
  } };
}

export function StuckSelection({ batchId, data, rows, now, isUpdating, listRef, onClose }: {
  readonly batchId: string | null; readonly data: StuckDashboard; readonly rows: readonly StuckTableRow[];
  readonly now: Date; readonly isUpdating: boolean; readonly listRef: RefObject<HTMLElement | null>; readonly onClose: () => void;
}) {
  const item = data.items.find((candidate) => candidate.batchId === batchId);
  const row = rows.find((candidate) => candidate.batchId === batchId);
  const isMissing = !isUpdating && batchId !== null && (item === undefined || row === undefined);
  useEffect(() => { if (isMissing) listRef.current?.focus(); }, [isMissing, listRef]);
  if (isUpdating || batchId === null) return null;
  if (item === undefined || row === undefined) return <Alert type="info" title="原批次已不在当前卡点清单，原筛选已保留。"
    action={<Button onClick={onClose}>关闭提示</Button>} />;
  return <StuckDetails key={batchId} item={item} row={row} now={now} onClose={onClose} />;
}

function StuckDetails({ item, row, now, onClose }: {
  readonly item: StuckItem; readonly row: StuckTableRow; readonly now: Date; readonly onClose: () => void;
}) {
  const canReadLine = useCan('data.read');
  const [isShown, setShown] = useState(false);
  useDetailReturnFocus(isShown, { allowContainerFocus: true });
  const signals = stuckSignals(item);
  return <Drawer open title="卡点批次明细" size={`min(${drawerWidth}px, 100vw)`} onClose={onClose}
    afterOpenChange={setShown} focusable={{ trap: true, focusTriggerAfterClose: false }}>
    <Descriptions size="small" column={1} items={[
      { key: 'po', label: '采购单', children: row.po },
      { key: 'batch', label: '要货批次', children: row.batchSeq === undefined ? row.batchId : `第 ${row.batchSeq} 批` },
      ...(canReadLine && item.orderLineId !== undefined
        ? [{ key: 'line', label: '订单行', children: <StuckOrderLink lineId={item.orderLineId} batchId={item.batchId} /> }] : []),
      { key: 'name', label: '品名', children: row.name },
      { key: 'stage', label: '阶段', children: `${row.stageLabel} · 停留 ${row.daysInStage} 天` },
      { key: 'waiting', label: '交付等待方', children: item.waitingOn.reason === undefined ? row.waiting : `${row.waiting}（${WAITING_REASON[item.waitingOn.reason]}）` },
      { key: 'owner', label: '内部负责人', children: row.owner },
      { key: 'confirmed', label: '确认到货', children: row.confirmed === EM_DASH ? EM_DASH : formatTableDate({ iso: row.confirmed, now }) },
      { key: 'quantities', label: '批次实物数量', children: <BatchQuantities fulfillment={item.fulfillment} /> },
      { key: 'signals', label: '关联与异常', children: signals.length === 0 ? EM_DASH : signals.map((label) => <Tag key={label}>{label}</Tag>) },
    ]} />
  </Drawer>;
}

function StuckOrderLink({ lineId, batchId }: { readonly lineId: string; readonly batchId: string }) {
  const { search } = useLocation();
  const from = stuckReturnAddress(search);
  const link = useDetailFocusLink(from ?? '/dashboard', stuckOrderFocus(batchId));
  const params = new URLSearchParams({ focusBatch: batchId });
  if (from !== null) params.set(STUCK_RETURN_PARAM, search.slice(1));
  return <Link to={`/lines/${encodeURIComponent(lineId)}?${params}`} {...link}>核对本批记录</Link>;
}

function BatchQuantities({ fulfillment }: { readonly fulfillment: StuckItem['fulfillment'] }) {
  const unit = fulfillment?.unit;
  const quantities = [
    { label: '未发', value: fulfillment?.unshippedQty },
    { label: '在途', value: fulfillment?.inTransitQty },
    { label: '实收', value: fulfillment?.receivedQty },
  ];
  return <Flex gap={space[2]} wrap>
    {quantities.map(({ label, value }) => <span key={label} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {label} {value == null || unit == null ? EM_DASH : `${formatQuantity(value)} ${unit}`}
    </span>)}
    {quantities.some(({ value }) => value == null) ? <Typography.Text type="secondary">数量待核</Typography.Text> : null}
  </Flex>;
}

function stuckSignals(item: StuckItem): string[] {
  return [
    !item.factoryLinked && CAUSE_LABEL.missing_factory,
    item.factoryUnlinked && CAUSE_LABEL.factory_demand_unlinked,
    item.exceptionOpen && CAUSE_LABEL.exception_open,
    item.supplierAliasPending && CAUSE_LABEL.supplier_pending,
    item.bomMissing && CAUSE_LABEL.bom_missing,
  ].filter((label) => label !== false);
}
