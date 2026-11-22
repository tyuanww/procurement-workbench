import type { GetLineDetail, GetLineDetailDeps } from '../boundary.js';

export const makeGetLineDetail =
  (deps: GetLineDetailDeps): GetLineDetail =>
  async (input) => deps.lines.getDetail(input.lineId, input.store);
