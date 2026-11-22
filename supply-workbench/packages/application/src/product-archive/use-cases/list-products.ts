import type { ListProducts, ListProductsDeps } from '../boundary.js';
import { cardOf, groupOf } from './cards.js';

export const makeListProducts =
  (deps: ListProductsDeps): ListProducts =>
  async (input) => {
    const loaded = await deps.products.listSources(input);
    return { items: loaded.sources.map((source) => cardOf(source, loaded.asOf)), page: loaded.page, groups: groupOf(loaded.sources) };
  };
