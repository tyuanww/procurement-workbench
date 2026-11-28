import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Divider, Drawer, Empty, Flex, Skeleton, Timeline, Typography } from 'antd';
import { batchStatusLabel, followUpKindLabel, isOpenBatch, lineStageLabel, type OrderLineId } from '@sw/domain';
import { ProcurementStoreSchema, type LineTimeline, type OrderLineDetail, type TimelineEvent } from '@sw/contracts';
import { failureText, read, readFailureOf } from '../../../shared/api/reads.js';
import { timelineLineText } from '../../../features/follow-up/index.js';
import { formatDateTime, formatQuantity } from '../../../shared/ui/format.js';
import { drawerWide } from '../../../theme/tokens.js';
import { LineDetailLink } from '../detail/desk-navigation.js';
import { useImportLineMember } from '../detail/import-detail-verification.js';

export type FollowUpPreviewDrawerProps = {
  readonly lineId: OrderLineId;
  readonly search: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
};

type PreviewState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly detail: OrderLineDetail; readonly timeline: LineTimeline }
  | { readonly kind: 'failed'; readonly message: string };

export function FollowUpPreviewDrawer(props: FollowUpPreviewDrawerProps) {
  const params = new URLSearchParams(props.search);
  const store = params.has('importBatchId') ? ProcurementStoreSchema.safeParse(params.get('store')).data : undefined;
  const { isImportMember: isVerifiedImport, isCheckingImportMembership } = useImportLineMember({ params, lineId: props.lineId, enabled: props.isOpen });
  const [state, setState] = useState<PreviewState>({ kind: 'loading' });
  useEffect(() => {
    if (!props.isOpen) return;
    const abort = new AbortController();
    setState({ kind: 'loading' });
    void Promise.all([
      read({ name: 'line', id: props.lineId, ...(store === undefined ? {} : { store }), signal: abort.signal }),
      read({ name: 'lineTimeline', id: props.lineId, signal: abort.signal }),
    ]).then(([detail, timeline]) => {
      if (abort.signal.aborted) return;
      setState({ kind: 'ready', detail, timeline });
    }).catch((error: unknown) => {
      if (abort.signal.aborted) return;
      const failure = readFailureOf(error);
      if (failure === null) return;
      setState({ kind: 'failed', message: failureText(failure) });
    });
    return () => abort.abort();
  }, [props.lineId, props.isOpen, store]);

  return (
    <Drawer
      placement="right"
      size={`min(${drawerWide}px, 100vw)`}
      open={props.isOpen}
      destroyOnHidden
      focusable={{ trap: true, focusTriggerAfterClose: false }}
      onClose={props.onClose}
      title={state.kind === 'ready' ? `${state.detail.po.poRaw ?? '无单号'} 预览` : '订单行预览'}
      footer={<PreviewFooter {...props} isVerifiedImport={isVerifiedImport} isCheckingImportMembership={isCheckingImportMembership} />}
    >
      {state.kind === 'loading' ? <Skeleton active paragraph={{ rows: 10 }} /> : null}
      {state.kind === 'failed' ? <Alert type="error" showIcon title={state.message} /> : null}
      {state.kind === 'ready' ? <FollowUpPreviewFields detail={state.detail} timeline={state.timeline} search={props.search} isVerifiedImport={isVerifiedImport} isCheckingImportMembership={isCheckingImportMembership} /> : null}
    </Drawer>
  );
}

type PreviewMembership = Pick<Parameters<typeof LineDetailLink>[0], 'isVerifiedImport' | 'isCheckingImportMembership'>;
type PreviewDetailScope = { readonly search: string } & PreviewMembership;

function PreviewFooter({ lineId, search, isVerifiedImport, isCheckingImportMembership, onClose }: Pick<FollowUpPreviewDrawerProps, 'lineId' | 'onClose'> & PreviewDetailScope) {
  return (
    <Flex align="center" justify="flex-end" gap={12} wrap>
      <LineDetailLink href={`/lines/${encodeURIComponent(lineId)}`} search={search} isVerifiedImport={isVerifiedImport} isCheckingImportMembership={isCheckingImportMembership}>打开订单行详情</LineDetailLink>
      <Button onClick={onClose}>关闭</Button>
    </Flex>
  );
}

export function FollowUpPreviewFields(props: { readonly detail: OrderLineDetail; readonly timeline: LineTimeline; readonly search?: string; readonly error?: string } & PreviewMembership) {
  const { detail, timeline, search = '', isVerifiedImport, isCheckingImportMembership } = props;
  const line = detail.line;
  return (
    <div>
      {props.error === undefined || props.error === '' ? null : <Alert type="error" showIcon title={props.error} style={{ marginBottom: 16 }} />}
      <Typography.Title level={4}>订单行摘要</Typography.Title>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} styles={{ label: { whiteSpace: 'nowrap' } }} items={[
        { key: 'po', label: '采购单号', children: detail.po.poRaw ?? '无单号' },
        { key: 'name', label: '品名', children: line.nameRaw ?? '—' },
        { key: 'supplier', label: '供应商', children: line.supplier.displayName ?? line.supplier.rawName ?? '—' },
        { key: 'factory', label: '工厂', children: factoryText(line) },
        { key: 'quantity', label: '数量', children: formatQuantity(line.qtyOrdered) },
        { key: 'stage', label: '阶段', children: lineStageLabel(line.stage) },
        { key: 'buyer', label: '负责人', children: line.buyer?.name ?? '未分配' },
      ]} />
      <Divider />
      <Typography.Title level={4}>订单行下一到货</Typography.Title>
      <NextArrival detail={detail} search={search} isVerifiedImport={isVerifiedImport} isCheckingImportMembership={isCheckingImportMembership} />
      <Divider />
      <Typography.Title level={4}>各批次交期与数量</Typography.Title>
      <BatchSection detail={detail} search={search} isVerifiedImport={isVerifiedImport} isCheckingImportMembership={isCheckingImportMembership} />
      <Divider />
      <Typography.Title level={4}>时间线</Typography.Title>
      <TimelineSection events={timeline.events} />
      <Divider />
      <Typography.Title level={4}>跟进记录</Typography.Title>
      <FollowUpSection detail={detail} />
    </div>
  );
}

function factoryText(line: OrderLineDetail['line']): string {
  return line.factory?.displayName ?? '未关联';
}

function NextArrival({ detail, search, isVerifiedImport, isCheckingImportMembership }: { readonly detail: OrderLineDetail } & PreviewDetailScope) {
  const due = detail.line.nextDue;
  if (due === null || due.dateBuyerConfirmed === null) {
    return <Typography.Text type="secondary">{nextArrivalMissing(detail)}</Typography.Text>;
  }
  const batch = detail.batches.find(({ id }) => id === due.batchId);
  const batchLink = batch === undefined ? null : <LineDetailLink href={batchPreviewHref(batch)} search={search} isVerifiedImport={isVerifiedImport} isCheckingImportMembership={isCheckingImportMembership}>第 {batch.seq} 批</LineDetailLink>;
  return <Descriptions size="small" column={1} items={[
    { key: 'confirmed', label: '开放批次最早的采购确认到货日', children: due.dateBuyerConfirmed },
    ...(batchLink === null ? [] : [{ key: 'batch', label: '对应批次', children: batchLink }]),
    ...(due.overdueDays === null || due.overdueDays <= 0 ? [] : [{ key: 'overdue', label: '逾期天数', children: `${due.overdueDays} 天` }]),
  ]} />;
}

function nextArrivalMissing(detail: OrderLineDetail): string {
  const open = detail.batches.filter((batch) => isOpenBatch(batch.status));
  if (open.length === 0) return '当前没有开放批次。历史批次的采购确认到货日见下方。';
  if (open.every((batch) => batch.dateBuyerConfirmed === null)) return '开放批次尚未填写采购确认到货日。';
  return '订单行暂无汇总日期，可在下方核对各批次的采购确认到货日。';
}

function batchPreviewHref(batch: OrderLineDetail['batches'][number]): string {
  return `/lines/${encodeURIComponent(batch.orderLineId)}?focusBatch=${encodeURIComponent(batch.id)}`;
}

function BatchSection({ detail, search, isVerifiedImport, isCheckingImportMembership }: { readonly detail: OrderLineDetail } & PreviewDetailScope) {
  if (detail.batches.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无批次" />;
  const due = detail.line.nextDue;
  return <Flex vertical gap="small">
    {detail.batches.map((batch) => {
      const isNext = due?.batchId === batch.id && due.dateBuyerConfirmed !== null;
      return <Descriptions key={batch.id} title={`第 ${batch.seq} 批 · ${batchStatusLabel(batch.status)}${isNext ? ' · 下一到货' : ''}`}
        extra={<LineDetailLink href={batchPreviewHref(batch)} search={search} isVerifiedImport={isVerifiedImport} isCheckingImportMembership={isCheckingImportMembership}>查看第 {batch.seq} 批</LineDetailLink>}
        size="small" column={{ xs: 1, sm: 3 }} items={[
        { key: 'confirmed', label: '采购确认到货日', children: batch.dateBuyerConfirmed ?? '未填写' },
        ...(batch.dateFactoryRequired === null ? [] : [{ key: 'factory', label: '代工厂需求日', children: batch.dateFactoryRequired }]),
        ...(batch.dateSupplierPromised === null ? [] : [{ key: 'supplier', label: '供应商承诺日', children: batch.dateSupplierPromised }]),
        { key: 'planned', label: '计划', children: formatQuantity(batch.plannedQty) },
        { key: 'shipped', label: '已发', children: formatQuantity(batch.shippedQty) },
        { key: 'received', label: '已收', children: formatQuantity(batch.receivedQty) },
      ]} />;
    })}
  </Flex>;
}

function TimelineSection({ events }: { readonly events: readonly TimelineEvent[] }) {
  if (events.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无时间线" />;
  return <Timeline items={events.map((event) => ({
    key: event.id,
    content: `${timelineLineText(event)}${event.actor === null ? '' : ` · ${event.actor.name}`}`,
  }))} />;
}

function FollowUpSection({ detail }: { readonly detail: OrderLineDetail }) {
  if (detail.followUps.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无跟进记录" />;
  return <ul>{detail.followUps.map((item) => <li key={item.id}><Typography.Text>{followUpKindLabel(item.kind)}</Typography.Text> · {item.text} · {item.createdBy}</li>)}</ul>;
}

export function previewRequestLabel(input: { readonly at: string }): string {
  return formatDateTime(input.at) ?? '时间无法识别';
}
