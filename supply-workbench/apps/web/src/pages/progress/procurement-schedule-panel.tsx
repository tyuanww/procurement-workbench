import type { ReactNode } from 'react';
import { Alert, Button, Drawer, Skeleton, Space, Typography, theme } from 'antd';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { BatchView, OrderLineDetail, ProcurementStore } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { BuildProcurementForm, ProcurementBatchDates, ProcurementDateEvidence, ProcurementStageList, SupplierPromiseEditor } from '../../features/plan/index.js';
import { scheduleSource, scheduleWorkspaceBack } from '../../features/progress/index.js';
import type { TodayOrderRef } from '../../features/today/index.js';
import { useDetailFocusLink, useDetailReturnFocus } from '../../shared/hooks/detail-return-focus.js';
import { useCanWrite } from '../../shared/actor.js';
import { drawerWidth, space } from '../../theme/tokens.js';
import type { WeeklyOrderDelivery } from './planning-batches.js';
import type { PlanningLoad } from './planning-load.js';
import { hasOutstandingDelivery, orderDeliveryActions, type BatchDependencies } from './weekly-delivery.js';
import { orderBatchDetailFacts, BatchOverview, BatchOverviewTitle } from './procurement-batch-overview.js';
import './procurement-batch-overview.css';

type Resource<T> = { readonly load: PlanningLoad<T>; readonly reload: () => void };
type Selection = {
  readonly store: ProcurementStore;
  readonly today: LocalDate;
  readonly selected: string;
  readonly onClose: () => void;
  readonly onTimelineChanged: () => void;
  readonly onAnchor: (date: LocalDate) => void;
  readonly detail: Resource<OrderLineDetail>;
  readonly selectedBatch: string | null;
  readonly onCloseBatch: () => void;
  readonly batchDependencies?: BatchDependencies | undefined;
  readonly weeklyBatch?: WeeklyOrderDelivery | undefined;
};

export function ProcurementSchedulePanel(props: Selection) {
  const [params] = useSearchParams();
  if (props.selectedBatch !== null && params.get('scheduleBatchEntry') === '1') return <ProcurementBatchDrawer {...props} standalone />;
  const loaded = props.detail.load.kind === 'ready' ? props.detail.load.data : null;
  const hasBatch = loaded?.batches.some(({ id }) => id === props.selectedBatch);
  const hasTask = loaded?.procurementSchedule?.items.some(({ id }) => id === params.get('procurementTask'));
  return <Drawer title="成品订单排期" open onClose={props.onClose} size={`min(${drawerWidth}px, 100vw)`}
    focusable={{ trap: true, focusTriggerAfterClose: false }} keyboard={!hasBatch && !hasTask}>
    <ProcurementScheduleDetail {...props} key={props.selected} />
    <ProcurementBatchDrawer {...props} standalone={false} />
  </Drawer>;
}

function ProcurementScheduleDetail({ store, detail, onTimelineChanged, onAnchor }: Selection) {
  const canWrite = useCanWrite('records.write');
  const selection = useStageSelection();
  if (detail.load.kind === 'loading') return <Skeleton active paragraph={{ rows: 3 }} />;
  if (detail.load.kind === 'error') return <Alert type="error" showIcon title={detail.load.message} action={<Button size="small" onClick={detail.reload}>重试</Button>} />;
  const { line, procurementSchedule: schedule, batches } = detail.load.data;
  const changed = () => { detail.reload(); onTimelineChanged(); };
  return (
    <Space orientation="vertical" size="middle" style={{ display: 'flex', marginTop: space[2] }}>
      {detail.load.notice === null ? null : <Alert type="error" title={detail.load.notice} action={<Button onClick={detail.reload}>重试</Button>} />}
      <ScheduleOrderLink order={{ lineId: line.id }} store={store} focusKey="planning-order">
        成品订单行详情
      </ScheduleOrderLink>
      <Typography.Text strong>{[line.nameRaw, line.po.poRaw].filter(Boolean).join(' · ')}</Typography.Text>
      <Typography.Text>采购负责人 {line.buyer?.name ?? '未分派'}</Typography.Text>
      {schedule === undefined ? <Alert type="info" title="该订单没有可用的采购排期来源" /> : <>
        <ProcurementDateEvidence schedule={schedule} batches={batches} />
        {schedule.items.length > 0 ? <ProcurementStageList schedule={schedule} onChanged={changed} selection={selection}
          orderLink={(order) => <ScheduleOrderLink order={order} store={store} focusKey="planning-stage" />} /> : canWrite && line.origin === 'import_po_master'
          ? <BuildProcurementForm schedule={schedule} orderLineId={line.id} store={store} onBuilt={(date) => { changed(); onAnchor(date); }} />
          : <Typography.Text type="secondary">尚未建立排期</Typography.Text>}
      </>}
      <BatchDates batches={batches} onChanged={changed} />
    </Space>
  );
}

function useStageSelection() {
  const [params, setParams] = useSearchParams();
  return {
    id: params.get('procurementTask'),
    open: (id: string | null) => {
      const next = new URLSearchParams(params);
      if (id === null) next.delete('procurementTask');
      else {
        next.delete('drawer');
        next.delete('developmentNode');
        next.set('procurementTask', id);
      }
      setParams(next, { preventScrollReset: true });
    },
  };
}

export function ScheduleOrderLink({ order, store, children = '打开订单行', focusKey, className }: {
  readonly order: TodayOrderRef;
  readonly store: ProcurementStore;
  readonly children?: ReactNode;
  readonly focusKey: string;
  readonly className?: string;
}) {
  const { pathname, search, state } = useLocation();
  const source = scheduleSource(new URLSearchParams(search), pathname);
  const query = new URLSearchParams({ backToSchedule: source.toString(), store });
  if (order.batchId !== undefined) query.set('focusBatch', order.batchId);
  const focus = useDetailFocusLink(scheduleWorkspaceBack(source), `${focusKey}:${order.lineId}:${order.batchId ?? ''}`);
  useDetailReturnFocus(true, { allowContainerFocus: true });
  return <Link to={`/lines/${encodeURIComponent(order.lineId)}?${query}`} className={className} {...focus}
    state={{ ...focus.state, ...(source.get('taskMode') === 'read' ? { scheduleTaskOrigin: state } : {}) }}>{children}</Link>;
}

function ProcurementBatchDrawer({ detail, selectedBatch, onCloseBatch, store, today, standalone, batchDependencies, onTimelineChanged, weeklyBatch }:
  Selection & { readonly standalone: boolean }) {
  const [params] = useSearchParams();
  const { token } = theme.useToken();
  const colors = {
    '--batch-primary': token.colorPrimary, '--batch-primary-hover': token.colorPrimaryHover,
    '--batch-primary-active': token.colorPrimaryActive, '--batch-on-primary': token.colorTextLightSolid,
    '--batch-button-radius': `${token.borderRadius}px`, color: token.colorText,
  };
  const ready = detail.load.kind === 'ready' ? detail.load : null;
  const batch = ready?.data.batches.find((entry) => entry.id === selectedBatch);
  if (selectedBatch === null || (!standalone && batch === undefined)) return null;
  const dependencies = batchDependencies?.get(selectedBatch);
  const delivery = batchDelivery({ batch, today, dependencies, weeklyBatch });
  return <Drawer
    title={batch === undefined || ready === null ? '要货批次' : <BatchOverviewTitle batch={batch} line={ready.data.line} delivery={delivery} today={today} />}
    footer={batch === undefined ? undefined : <ScheduleOrderLink order={{ lineId: batch.orderLineId, batchId: batch.id }}
      store={store} focusKey="planning-batch" className="procurement-batch-order-link">查看订单与收货记录</ScheduleOrderLink>}
    className="procurement-batch-drawer" styles={{
      header: { paddingInline: space[4] }, body: { padding: space[4] },
      footer: { padding: `${space[2]}px ${space[4]}px`, borderColor: token.colorSplit },
    }}
    style={colors}
    open onClose={onCloseBatch} keyboard={!params.has('drawer')}
    focusable={{ trap: true, focusTriggerAfterClose: !standalone }} size={`min(${drawerWidth}px, 100vw)`}>
    <BatchDrawerBody detail={detail} batch={batch} delivery={delivery} dependencies={dependencies} onTimelineChanged={onTimelineChanged} />
  </Drawer>;
}

function batchDelivery({ batch, today, dependencies, weeklyBatch }: {
  readonly batch: BatchView | undefined; readonly today: LocalDate; readonly dependencies: ReturnType<BatchDependencies['get']>;
  readonly weeklyBatch: WeeklyOrderDelivery | undefined;
}) {
  if (batch === undefined) return undefined;
  return orderDeliveryActions({ facts: orderBatchDetailFacts(batch), today,
    isOpen: batch.closedAt === null && hasOutstandingDelivery(batch),
    hasRisk: dependencies?.some(({ conflicts }) => conflicts.length > 0) ?? false,
    reviewCount: batch.fulfillment?.reviewCount ?? 0, supplier: weeklyBatch?.supplier ?? null,
  });
}

function BatchDrawerBody({ detail, batch, delivery, dependencies, onTimelineChanged }:
  Pick<Selection, 'detail' | 'onTimelineChanged'> & {
    readonly batch: BatchView | undefined; readonly delivery: WeeklyOrderDelivery | undefined; readonly dependencies: ReturnType<BatchDependencies['get']>;
  }) {
  if (detail.load.kind === 'loading') return <Skeleton active paragraph={{ rows: 3 }} />;
  if (detail.load.kind === 'error') return <Alert type="error" showIcon title={detail.load.message} action={<Button onClick={detail.reload}>重试</Button>} />;
  if (batch === undefined) return <Alert type="warning" showIcon title="该订单中找不到要货批次" />;
  return <>
    {detail.load.notice === null ? null : <Alert className="procurement-batch-notice" type="error" showIcon title={detail.load.notice}
      action={<Button onClick={detail.reload}>重试</Button>} />}
    <BatchOverview key={batch.id} batch={batch} dependencies={dependencies} delivery={delivery}
      onChanged={() => { detail.reload(); onTimelineChanged(); }} />
  </>;
}

function BatchDates({ batches, onChanged }: { readonly batches: OrderLineDetail['batches']; readonly onChanged: () => void }) {
  if (batches.length === 0) return <Typography.Text type="secondary">暂无要货批次，供应商承诺和实际收货待登记。</Typography.Text>;
  return <section aria-label="批次承诺和收货">{batches.map((batch) => <div key={batch.id} style={{ marginTop: space[2] }}>
    <Typography.Text strong>批次 {batch.seq}</Typography.Text>
    <ProcurementBatchDates batch={batch} />
    <SupplierPromiseEditor key={`${batch.id}:${batch.dateSupplierPromised}`} batch={batch} onChanged={onChanged} />
  </div>)}</section>;
}
