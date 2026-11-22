import type { LineTimeline } from '../follow-up/views.js';

export interface TimelineQueries {
  /** cursor 为空从最新开始。没有更多时 nextCursor 为 null。 */
  list(lineId: string, cursor?: string): Promise<LineTimeline>;
}
