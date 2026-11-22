import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';
import { formatDateTime } from '../../shared/ui/format.js';
import { fontSize, space, statusColor } from '../../theme/tokens.js';
import { eventHistoryParts, type WorkItemDetail } from '../today/index.js';

export function WorkItemEventHistory(props: { readonly events: WorkItemDetail['events'] }): ReactNode {
  const events = props.events.slice(0, 10);
  return (
    <div style={{ marginTop: space[4] }}>
      <Typography.Title level={3} style={{ marginBottom: space[2] }}>事件历史</Typography.Title>
      {events.length === 0 ? <Typography.Text type="secondary">还没有事件。</Typography.Text> : null}
      <Flex vertical gap={space[1]}>
        {events.map((event) => <EventHistoryRow key={event.id} event={event} />)}
      </Flex>
    </div>
  );
}

function EventHistoryRow(props: { readonly event: WorkItemDetail['events'][number] }): ReactNode {
  const parts = eventHistoryParts(props.event);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], fontSize: fontSize.table }}>
      <span style={{ color: statusColor.neutral.text, minWidth: 112 }}>{formatDateTime(props.event.createdAt) ?? '—'}</span>
      <span>{parts.sentence}</span>
      <span style={{ color: statusColor.neutral.text }}>{parts.actor}</span>
      <span style={{ color: statusColor.neutral.text }}>{parts.owner}</span>
    </div>
  );
}
