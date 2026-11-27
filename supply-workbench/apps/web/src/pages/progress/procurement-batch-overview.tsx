import { Alert, Card, Collapse, Descriptions, Flex, Statistic, Typography, theme, type CollapseProps } from 'antd';
import type { BatchView, OrderLineDetail } from '@sw/contracts';
import { countsInRecordedQuantity, diffDays, normalizeUnit, type LocalDate } from '@sw/domain';
import { SupplierPromiseHistory } from '../../features/plan/index.js';
import { workItemStatusLabel } from '../../features/today/index.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { StatusTag } from '../../shared/ui/widgets.js';
import { brand, fontSize, space } from '../../theme/tokens.js';
import { orderBatchFacts, weeklySupplierText, type WeeklyOrderAction, type WeeklyOrderDelivery } from './planning-batches.js';
import { SchedulePredecessorLink } from './planning-drill.js';
import { InlineSupplierPromise } from './procurement-batch-promise.js';
import { weeklyActionLabel } from './planning-rows.js';
import type { BatchDependencies } from './weekly-delivery.js';

type Dependencies = NonNullable<ReturnType<BatchDependencies['get']>>;
type CollapseItem = NonNullable<CollapseProps['items']>[number];

export function BatchOverviewTitle({ batch, line, delivery, today }: {
  readonly batch: BatchView; readonly line: OrderLineDetail['line']; readonly delivery: WeeklyOrderDelivery | undefined; readonly today: LocalDate;
}) {
  const po = line.po.poRaw ?? 'PO 单号待核';
  const supplier = delivery?.supplier?.name ?? line.supplier.displayName ?? line.supplier.rawName
    ?? weeklySupplierText(delivery?.supplier ?? null);
  return <div className="procurement-batch-heading">
    <Flex gap={space[1]} wrap="wrap" align="center">
      <span>{line.nameRaw === null ? '' : `${line.nameRaw} · `}<span className="procurement-batch-number">要货批次 {batch.seq}</span></span>
      <BatchTiming batch={batch} delivery={delivery} today={today} />
    </Flex>
    <Typography.Text type="secondary" className="procurement-batch-order-meta">{po} · {supplier}</Typography.Text>
  </div>;
}

function BatchTiming({ batch, delivery, today }: Pick<Parameters<typeof BatchOverviewTitle>[0], 'batch' | 'delivery' | 'today'>) {
  switch (delivery?.timing) {
    case 'overdue': return <StatusTag status="overdue" label={batch.dateBuyerConfirmed === null ? '已逾期' : `逾期 ${diffDays(today, batch.dateBuyerConfirmed)} 天`} />;
    case 'due-today': return <StatusTag status="due_today" label="今日到期" />;
    case 'needs-review': return <StatusTag status="fulfillment_review" label="信息待核" />;
    case 'upcoming': return <StatusTag status="upcoming" label="尚未到期" />;
    case 'settled': case undefined: return <StatusTag status={batch.status} />;
  }
}

export function orderBatchDetailFacts(batch: BatchView) {
  return orderBatchFacts({
    confirmed: batch.dateBuyerConfirmed, firstConfirmed: batch.firstConfirmedDate, required: batch.dateFactoryRequired,
    supplierPromised: batch.dateSupplierPromised, plannedQty: batch.plannedQty, fulfillment: batch.fulfillment ?? null, owner: null,
  });
}

export function BatchOverview({ batch, delivery, dependencies, onChanged }: {
  readonly batch: BatchView;
  readonly delivery: WeeklyOrderDelivery | undefined;
  readonly dependencies: Dependencies | undefined;
  readonly onChanged: () => void;
}) {
  const facts = orderBatchDetailFacts(batch);
  const predecessors = dependencies ?? [];
  const conflict = predecessors.flatMap(({ conflicts }) => conflicts).at(0);
  const evidence = batchEvidence(batch);
  const provenance = [evidence, predecessorRecords(predecessors)].filter((item) => item !== null);
  return <Flex vertical gap={space[3]} className="procurement-batch-overview">
    <QuantitySummary facts={facts} fulfillment={batch.fulfillment} actions={delivery?.actions ?? []} />
    {conflict === undefined ? null : <Alert className="procurement-batch-predecessor-risk" type="warning" showIcon title="前置排期冲突"
      description={<>请核对前置任务 <SchedulePredecessorLink predecessor={conflict} focusKey={`batch-predecessor-risk:${batch.id}:${conflict.id}`} />，计划完成日为 <DateValue value={conflict.plannedEnd} />。</>} />}
    <section aria-label="交期">
      <Typography.Title level={3} className="procurement-batch-section-title">交期</Typography.Title>
      <Descriptions colon={false} column={1} size="small" className="procurement-batch-dates" items={[
        { key: 'confirmed', label: '采购确认到货日', children: <DateValue value={facts.confirmed} missing="待确认" /> },
        ...(facts.original === null ? [] : [{ key: 'first', label: '首次采购确认到货日', children: <DateValue value={facts.original} /> }]),
      ]} />
      <InlineSupplierPromise batch={batch} onChanged={onChanged} />
      <DateConflict batch={batch} conflict={facts.conflict} />
      <SupplierPromiseHistory batch={batch} />
    </section>
    {evidence === null ? <section aria-label="发收货凭据">
      <Typography.Title level={3} className="procurement-batch-section-title">发收货凭据</Typography.Title>
      <Typography.Text type="secondary">暂无已核实的发货或收货凭据。</Typography.Text>
    </section> : null}
    {provenance.length === 0 ? null : <Collapse className="procurement-batch-evidence" ghost expandIconPlacement="start" size="small" items={provenance} />}
  </Flex>;
}

function QuantitySummary({ facts, fulfillment, actions }: {
  readonly facts: ReturnType<typeof orderBatchFacts>;
  readonly fulfillment: BatchView['fulfillment'];
  readonly actions: readonly WeeklyOrderAction[];
}) {
  const { token } = theme.useToken();
  const unit = normalizeUnit(facts.unit);
  const outstanding = unit === null ? null : facts.outstandingQty;
  const received = unit === null ? null : facts.receivedQty;
  return <Card size="small" variant="borderless" style={{
    background: `color-mix(in srgb, ${token.colorPrimaryBg} 35%, ${token.colorBgContainer})`,
  }} styles={{
    body: { padding: space[3] },
  }}>
    <Statistic title="欠收量" value={outstanding ?? '—'} formatter={() => formatQuantity(outstanding)}
      suffix={outstanding === null ? undefined : <span className="procurement-batch-unit">{unit}</span>}
      styles={{ title: { marginBottom: 0 }, content: { color: brand[800], fontSize: fontSize.metric, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }} />
    {outstanding === null ? <Typography.Text type="secondary">数量待核实</Typography.Text> : null}
    <Flex wrap="wrap" gap={space[0]} className="procurement-batch-quantities">
      <Typography.Text type="secondary">计划 {formatQuantity(facts.plannedQty)}{unit === null ? '（单位待核）' : ` ${unit}`}</Typography.Text>
      <Typography.Text type="secondary">{receivedText(received, unit)}</Typography.Text>
    </Flex>
    <QuantityActions actions={actions} fulfillment={fulfillment} />
  </Card>;
}

function receivedText(quantity: number | null, unit: string | null): string {
  return quantity === null || unit === null ? '实收待核实' : `确认实收 ${formatQuantity(quantity)} ${unit}`;
}

function QuantityActions({ fulfillment, actions }: {
  readonly fulfillment: BatchView['fulfillment']; readonly actions: readonly WeeklyOrderAction[];
}) {
  const reviewCount = fulfillment?.reviewCount ?? 0;
  return <>
    {actions.length === 0 ? null : <ul className="procurement-batch-actions" aria-label="当前待办">
      {actions.map((action) => <li key={action.kind}><Typography.Text strong>{drawerAction(action, fulfillment)}</Typography.Text></li>)}
    </ul>}
    {reviewCount === 0 ? null : <Typography.Text type="warning">{reviewCount} 条发收货记录待核</Typography.Text>}
  </>;
}

function drawerAction(action: WeeklyOrderAction, fulfillment: BatchView['fulfillment']): string {
  if (action.kind !== 'check-receipt') return weeklyActionLabel(action);
  const inTransit = fulfillment?.inTransitQty;
  const unit = normalizeUnit(fulfillment?.unit);
  if (inTransit != null && inTransit > 0 && unit !== null) return `核对在途待收 ${formatQuantity(inTransit)} ${unit}`;
  return inTransit == null ? '核对发收货记录' : weeklyActionLabel(action);
}

function DateValue({ value, missing = '—' }: { readonly value: LocalDate | null; readonly missing?: string }) {
  return value === null ? <Typography.Text type="secondary">{missing}</Typography.Text> : <time dateTime={value}>{value}</time>;
}

function DateConflict({ batch: { dateBuyerConfirmed: confirmed }, conflict }: {
  readonly batch: BatchView; readonly conflict: ReturnType<typeof orderBatchFacts>['conflict'];
}) {
  if (conflict === null) return null;
  const { required, supplierPromised } = conflict;
  const isConfirmedLate = isAfter(confirmed, required);
  const isSupplierLate = isAfter(supplierPromised, required);
  return <Typography.Paragraph type="warning" className="procurement-batch-date-conflict">
    {isConfirmedLate || isSupplierLate ? <>代工厂需求日 <DateValue value={required} /> 早于{isConfirmedLate ? '采购确认到货日' : '供应商承诺日'}。</> : null}
    {isAfter(supplierPromised, confirmed) ? '供应商承诺日晚于采购确认到货日。' : null}
  </Typography.Paragraph>;
}

function isAfter(date: LocalDate | null, reference: LocalDate | null): boolean {
  return date !== null && reference !== null && date > reference;
}

type FulfillmentRow = BatchView['shipments'][number] | BatchView['receipts'][number];
type VerifiedBatchEvidence = { readonly key: string; readonly date: LocalDate; readonly qty: number; readonly unit: string | null; readonly evidence: string };

function availableEvidence<T extends FulfillmentRow>(records: readonly T[], dateOf: (record: T) => LocalDate): VerifiedBatchEvidence[] {
  return records.flatMap((record) => {
    const facts = record.fulfillment;
    if (facts == null || facts.kind === 'reported' || !countsInRecordedQuantity(record)) return [];
    return [{ key: record.id, date: dateOf(record), qty: record.qty, unit: facts.unit, evidence: facts.evidence }];
  }).sort((left, right) => right.date.localeCompare(left.date));
}

function batchEvidence(batch: BatchView): CollapseItem | null {
  const shipments = availableEvidence(batch.shipments, (record) => record.shippedOn);
  const receipts = availableEvidence(batch.receipts, (record) => record.receivedOn);
  const count = shipments.length + receipts.length;
  if (count === 0) return null;
  return {
    key: 'evidence', label: '发收货凭据', extra: <Typography.Text type="secondary">{count} 条已核实</Typography.Text>,
    children: <Flex vertical gap={space[2]}>
        {shipments.length === 0 ? null : <EvidenceGroup title="发货" records={shipments} />}
        {receipts.length === 0 ? null : <EvidenceGroup title="收货" records={receipts} />}
      </Flex>,
  };
}

function EvidenceGroup({ title, records }: { readonly title: string; readonly records: readonly VerifiedBatchEvidence[] }) {
  return <div>
    <Typography.Text strong>{title}</Typography.Text>
    <ul className="procurement-batch-records">
      {records.map((record) => <li key={record.key}>
        <DateValue value={record.date} /> · {formatQuantity(record.qty)}{record.unit === null ? '' : ` ${record.unit}`} · {record.evidence}
      </li>)}
    </ul>
  </div>;
}

function predecessorRecords(tasks: Dependencies): CollapseItem | null {
  if (tasks.length === 0) return null;
  return { key: 'predecessors', label: '关联任务与前置', children: <Flex vertical gap={space[2]}>
    {tasks.map(({ task, dependencies, conflicts }) => <div key={task.id}>
      <Typography.Text strong>{task.title} · {workItemStatusLabel(task.status)}</Typography.Text>
      {dependencies.length === 0 ? null : <ul className="procurement-batch-records">
        {dependencies.map((predecessor) => <li key={predecessor.id}>
          <SchedulePredecessorLink predecessor={predecessor} focusKey={`batch-predecessor:${task.id}:${predecessor.id}`} />{' · '}
          <Typography.Text type={conflicts.some(({ id }) => id === predecessor.id) ? 'warning' : 'secondary'}>
            {workItemStatusLabel(predecessor.status)} · <DateValue value={predecessor.plannedEnd} />
          </Typography.Text>
        </li>)}
      </ul>}
    </div>)}
  </Flex> };
}
