import type { GetProductStock, GetProductStockDeps } from '../boundary.js';
import { stockOf } from './cards.js';

export const makeGetProductStock =
  (deps: GetProductStockDeps): GetProductStock =>
  async (input) => stockOf(await deps.products.load(input));
