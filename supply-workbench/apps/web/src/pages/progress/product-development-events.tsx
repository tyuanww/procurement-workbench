import { Timeline, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { ProductDevelopmentBatch, ProductDevelopmentNode } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { formatDateTime } from '../../shared/ui/format.js';

type NodeEvent = {
  readonly key: string;
  readonly label: string;
  readonly date: { readonly value: string; readonly display: string } | null;
  readonly details?: ReactNode;
  readonly tone?: 'gray' | 'green';
};

export function DevelopmentNodeEventTimeline({ node }: { readonly node: ProductDevelopmentNode }): ReactNode {
  const events = nodeEvents(node);
  const dated = events.flatMap((event) => event.date === null ? [] : [{ ...event, date: event.date }]);
  return <section aria-label="节点时间轴">
    <Typography.Title level={3}>节点时间轴</Typography.Title>
    <Timeline className="development-detail-timeline" items={dated.sort((a, b) => a.date.display.localeCompare(b.date.display))
      .map((event) => ({
        key: event.key, color: event.tone ?? 'blue',
        content: <EventContent event={event} />,
      }))} />
    {events.filter(({ date }) => date === null).map((event) => <EventContent key={event.key} event={event} />)}
    {node.replies.length === 0 ? <Typography.Text type="secondary">暂无采购回复</Typography.Text> : null}
  </section>;
}

function EventContent({ event }: { readonly event: NodeEvent }) {
  return <div className="development-detail-event">
    <div className="development-detail-event-heading">
      <Typography.Text strong>{event.label}</Typography.Text>
      {event.date === null ? <Typography.Text type="secondary">记录时间待核对</Typography.Text>
        : <time dateTime={event.date.value}>{event.date.display}</time>}
    </div>
    {event.details}
  </div>;
}

function nodeEvents({ plannedStart, plannedEnd, followUp, replies, batches }: ProductDevelopmentNode): NodeEvent[] {
  const events: NodeEvent[] = [];
  if (plannedStart !== plannedEnd) events.push(calendarEvent({ key: 'start', label: '计划开始', date: plannedStart }));
  events.push(calendarEvent({ key: 'required', label: '项目要求日', date: plannedEnd }));
  if (followUp !== undefined) {
    events.push({ key: 'update', label: '最近更新跟进', date: eventTimestamp(followUp.updatedAt) });
    if (followUp.reviewOn !== undefined) events.push(calendarEvent({ key: 'review', label: '下次跟进日', date: followUp.reviewOn }));
  }
  for (const reply of replies) {
    events.push({
      key: `reply:${reply.id}`, label: '采购回复', date: eventTimestamp(reply.recordedAt),
      details: <>
        <div>{reply.actorName ?? '采购账号'} · 供应商承诺日 <time dateTime={reply.promisedOn}>{reply.promisedOn}</time></div>
        <div className="development-detail-evidence">{reply.evidence}</div>
      </>,
    });
  }
  return events.concat(batches.flatMap(batchEvents));
}

function batchEvents(batch: ProductDevelopmentBatch): NodeEvent[] {
  const events: NodeEvent[] = [];
  const label = `批次 ${batch.seq}`;
  if (batch.supplierPromisedOn !== null) events.push(calendarEvent({
    key: `${batch.id}:promise`, label: `${label} · 正式供应商承诺日`, date: batch.supplierPromisedOn,
  }));
  if (batch.buyerConfirmedOn !== null) events.push(calendarEvent({
    key: `${batch.id}:confirmed`, label: `${label} · 正式采购确认到货日`, date: batch.buyerConfirmedOn,
  }));
  for (const date of new Set(batch.receiptDates ?? [])) {
    events.push({ key: `${batch.id}:receipt:${date}`, label: `${label} · 已核实收货`, date: { value: date, display: date }, tone: 'green' });
  }
  return events;
}

function calendarEvent({ key, label, date }: { readonly key: string; readonly label: string; readonly date: LocalDate }): NodeEvent {
  return { key, label, date: { value: date, display: date }, tone: 'gray' };
}

function eventTimestamp(value: string): NodeEvent['date'] {
  const display = formatDateTime(value);
  return display === null ? null : { value, display };
}
