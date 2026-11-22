import { expect, it } from 'vitest';
import { searchGroups } from '../../apps/web/src/features/search/hits.js';

it('搜索结果按订单行、产品和主体做成链接', () => {
  const groups = searchGroups({
    lines: [{ id: 'line-1', poRaw: 'PO1', nameRaw: '面膜', barcodeRaw: null, itemCodeRaw: '' }],
    products: [{ id: 'product-1', skuName: '面膜', barcodeRaw: '6975', filingName: null }],
    parties: [{ id: 'party-1', displayName: '宜侬' }],
  });
  expect(groups.lines).toEqual([{ id: 'line-1', label: 'PO1 面膜', to: '/lines/line-1' }]);
  expect(groups.products).toEqual([{ id: 'product-1', label: '面膜', to: '/products/product-1' }]);
  expect(groups.parties).toEqual([{ id: 'party-1', label: '宜侬', to: '/parties/party-1' }]);
  expect(searchGroups(null)).toEqual({ lines: [], products: [], parties: [] });
});
