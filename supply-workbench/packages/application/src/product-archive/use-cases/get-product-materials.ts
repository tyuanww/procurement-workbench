import type { GetProductMaterials, GetProductMaterialsDeps } from '../boundary.js';
import { materialsOf } from './cards.js';

export const makeGetProductMaterials =
  (deps: GetProductMaterialsDeps): GetProductMaterials =>
  async (input) => materialsOf(await deps.products.load(input));
