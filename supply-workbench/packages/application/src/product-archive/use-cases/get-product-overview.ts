import type { GetProductOverview, GetProductOverviewDeps } from '../boundary.js';
import { overviewOf } from './cards.js';

export const makeGetProductOverview =
  (deps: GetProductOverviewDeps): GetProductOverview =>
  async (input) => overviewOf(await deps.products.load(input));
