import type { GetFreshness, GetFreshnessDeps } from '../boundary.js';

export const makeGetFreshness =
  (deps: GetFreshnessDeps): GetFreshness =>
  async () => deps.freshness.load();
