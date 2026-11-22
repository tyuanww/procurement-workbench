import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Divider, Drawer, Empty, Flex, Skeleton, Typography } from 'antd';
import { followUpKindLabel, lineStageLabel, type OrderLineId } from '@sw/domain';
import type { LineTimeline, OrderLineDetail, TimelineEvent } from '@sw/contracts';
import { failureText, read, readFailureOf } from '../../../shared/api/reads.js';
import { batchLineText, timelineLineText } from '../../../features/follow-up/index.js';
import { formatDateTime, formatQuantity } from '../../../shared/ui/format.js';
import { drawerWide } from '../../../theme/tokens.js';

export type FollowUpPreviewDrawerProps = {
  readonly lineId: OrderLineId;
  readonly onClose: () => void;
};

type PreviewState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly detail: OrderLineDetail; readonly timeline: LineTimeline }
  | { readonly kind: 'failed'; readonly message: string };

export function FollowUpPreviewDrawer(props: FollowUpPreviewDrawerProps) {
  const [state, setState] = useState<PreviewState>({ kind: 'loading' });
  const requestToken = useRef(0);
  useEffect(() => {
    const token = requestToken.current + 1;
    requestToken.current = token;
    let isActive = true;
    const abort = new AbortController();
    setState({ kind: 'loading' });
    void Promise.all([
      read({ name: 'line', id: props.lineId, signal: abort.signal }),
      read({ name: 'lineTimeline', id: props.lineId, signal: abort.signal }),
    ]).then(([detail, timeline]) => {
      if (!isActive || abort.signal.aborted || requestToken.current !== token) return;
      setState({ kind: 'ready', detail, timeline });
    }).catch((error: unknown) => {
      if (!isActive || abort.signal.aborted || requestToken.current !== token) return;
      const failure = readFailureOf(error);
      if (failure === null) return;
      setState({ kind: 'failed', message: failureText(failure) });
    });
    return () => { isActive = false; abort.abort(); };
  }, [props.lineId]);

  const title = state.kind === 'ready' ? `${state.detail.po.poRaw ?? '无单号'} 预览` : '订单行预览';
  return (
    <Drawer
      placement="right"
      size={drawerWide}
      open
      onClose={props.onClose}
      title={title}
      footer={<Flex justify="flex-end" gap={12}><Button href={`/lines/${encodeURIComponent(props.lineId)}`}>打开订单行详情</Button><Button type="primary" onClick={props.onClose}>关闭</Button></Flex>}
    >
      {state.kind === 'loading' ? <Skeleton active paragraph={{ rows: 10 }} /> : null}
      {state.kind === 'failed' ? <Alert type="error" showIcon title={state.message} /> : null}
      {state.kind === 'ready' ? <FollowUpPreviewFields detail={state.detail} timeline={state.timeline} /> : null}
    </Drawer>
  );
}

export function FollowUpPreviewFields(props: { readonly detail: OrderLineDetail; readonly timeline: LineTimeline; readonly error?: string }) {
  const { detail, timeline } = props;
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
      <Typography.Title level={4}>下一到货</Typography.Title>
      <NextArrival detail={detail} />
      <Divider />
      <Typography.Title level={4}>批次</Typography.Title>
      <BatchSection detail={detail} />
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

function NextArrival({ detail }: { readonly detail: OrderLineDetail }) {
  const due = detail.line.nextDue;
  if (due === null) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无下一到货" />;
  return <Descriptions size="small" column={1} items={[
    { key: 'confirmed', label: '确认日', children: due.dateBuyerConfirmed ?? '—' },
    { key: 'overdue', label: '逾期天数', children: due.overdueDays === null ? '—' : String(due.overdueDays) },
    { key: 'factory', label: '代工厂需求日', children: due.dateFactoryRequired ?? '—' },
  ]} />;
}

function BatchSection({ detail }: { readonly detail: OrderLineDetail }) {
  if (detail.batches.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无批次" />;
  return <ul>{detail.batches.map((batch) => <li key={batch.id}>
    <Typography.Text strong>{batchLineText(batch)}</Typography.Text>
    <div>计划 {formatQuantity(batch.plannedQty)} · 已发 {formatQuantity(batch.shippedQty)} · 已收 {formatQuantity(batch.receivedQty)}</div>
  </li>)}</ul>;
}

function TimelineSection({ events }: { readonly events: readonly TimelineEvent[] }) {
  if (events.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无时间线" />;
  return <ul>{events.map((event) => <li key={event.id}>{timelineLineText(event)}{event.actor === null ? '' : ` · ${event.actor.name}`}</li>)}</ul>;
}

function FollowUpSection({ detail }: { readonly detail: OrderLineDetail }) {
  if (detail.followUps.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无跟进记录" />;
  return <ul>{detail.followUps.map((item) => <li key={item.id}><Typography.Text>{followUpKindLabel(item.kind)}</Typography.Text> · {item.text} · {item.createdBy}</li>)}</ul>;
}

export function previewRequestLabel(input: { readonly at: string }): string {
  return formatDateTime(input.at) ?? '时间无法识别';
}
