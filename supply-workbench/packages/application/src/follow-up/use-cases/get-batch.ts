import type { GetBatch, GetBatchDeps } from '../boundary.js';

export const makeGetBatch =
  (deps: GetBatchDeps): GetBatch =>
  async (input) => deps.lines.getBatch(input.batchId);
