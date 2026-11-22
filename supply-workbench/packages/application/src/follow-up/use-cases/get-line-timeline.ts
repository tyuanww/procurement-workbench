import type { GetLineTimeline, GetLineTimelineDeps } from '../boundary.js';

export const makeGetLineTimeline =
  (deps: GetLineTimelineDeps): GetLineTimeline =>
  async (input) => deps.timeline.list(input.lineId, input.cursor);
