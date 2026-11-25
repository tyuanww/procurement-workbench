import { Empty, Timeline, Typography } from 'antd';
import type { TimelineEvent } from '@sw/contracts';
import { timelineLineText } from '../../../features/follow-up/index.js';
import { formatDateTime } from '../../../shared/ui/format.js';
import { space } from '../../../theme/tokens.js';

export function DetailTimeline({ events }: { readonly events: readonly TimelineEvent[] }) {
  return (
    <section aria-label="时间线" style={{ marginTop: space[3] }}>
      <Typography.Title level={2}>时间线</Typography.Title>
      {events.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无时间线" /> : <Timeline items={events.map((event) => ({
        key: event.id,
        content: <div style={{ overflowWrap: 'anywhere' }}>
          {timelineLineText(event)}
          {event.kind === 'follow_up' && !event.voided ? <div style={{ whiteSpace: 'pre-wrap' }}>
            {event.text}
            {event.nextFollowUpAt === undefined ? null : <div>{event.nextFollowUpAt === null
              ? '已取消下次跟进提醒' : `下次跟进 · ${formatDateTime(event.nextFollowUpAt)}`}</div>}
          </div> : null}
        </div>,
      }))} />}
    </section>
  );
}
