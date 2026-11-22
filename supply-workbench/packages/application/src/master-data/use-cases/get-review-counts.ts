import type { GetReviewCounts, GetReviewCountsDeps } from '../boundary.js';

export const makeGetReviewCounts =
  (deps: GetReviewCountsDeps): GetReviewCounts =>
  async () => deps.master.reviewCounts();
