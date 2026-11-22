import { expect, it } from 'vitest';
import { makeSearchEverything } from '../../packages/application/src/search/index.js';
import type { SearchQueries } from '../../packages/application/src/ports/search-queries.js';
import type { SearchResult } from '../../packages/application/src/search/views.js';
import { anActor } from '../../packages/testkit/src/index.js';

function lines(count: number): SearchResult['lines'][number][] {
  return Array.from({ length: count }, (_item, index) => ({ kind: 'line', id: `line-${index}`, poRaw: null, nameRaw: null, barcodeRaw: null, itemCodeRaw: null }));
}

function products(count: number): SearchResult['products'][number][] {
  return Array.from({ length: count }, (_item, index) => ({ kind: 'product', id: `product-${index}`, skuName: `product-${index}`, barcodeRaw: `product-${index}`, filingName: null }));
}

function parties(count: number): SearchResult['parties'][number][] {
  return Array.from({ length: count }, (_item, index) => ({ kind: 'party', id: `party-${index}`, displayName: `party-${index}` }));
}

it('少于 2 个字不查，三组各留 5 条', async () => {
  let hasSearched = false;
  const search: SearchQueries = {
    search: async () => {
      hasSearched = true;
      return { lines: lines(6), products: products(6), parties: parties(6) };
    },
  };
  const run = makeSearchEverything({ search });
  await expect(run({ q: '  a ' }, anActor('buyer'))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(hasSearched).toBe(false);
  const found = await run({ q: ' 面膜 ' }, anActor('buyer'));
  expect(found.lines).toHaveLength(5);
  expect(found.products).toHaveLength(5);
  expect(found.parties).toHaveLength(5);
  expect(found.lines[0]).toMatchObject({ id: 'line-0' });
});
