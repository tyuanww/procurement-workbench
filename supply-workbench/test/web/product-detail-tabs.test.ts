// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import type { ProductOverview } from '../../packages/contracts/src/index.js';
import { ProductDetailBody } from '../../apps/web/src/pages/products/ProductDetailBody.js';
import { writeUrlState } from '../../apps/web/src/shared/hooks/url-state.js';
import { act, calls, click, element, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, useHostSearch } from './party-preview-dom.js';

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  await act(() => mounted?.unmount());
  mounted = undefined;
  resetDom();
});

it('采购请求挂起时，方向键仍能切换范围，焦点不会离开范围控件', () => {
  showDetail('card=purchases&stage=awaiting_date');
  const group = document.querySelector('[role="radiogroup"][aria-label="采购条码范围"]');
  const current = group?.querySelector<HTMLInputElement>('input:checked');
  if (current == null) throw new Error('没有采购范围选项');
  current.focus();
  pressRight(current);
  expect(group?.contains(document.activeElement)).toBe(true);
  expect(textOf('output')).toBe('card=purchases&stage=awaiting_date&scope=exact');
  expect(calls.find(({ url }) => url.endsWith('scope=all_channels'))?.signal?.aborted).toBe(true);

  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) throw new Error('采购范围焦点丢失');
  pressRight(active);
  expect(group?.contains(document.activeElement)).toBe(true);
  expect(textOf('output')).toContain('scope=all_channels');
  expect(calls.find(({ url }) => url.endsWith('scope=exact'))?.signal?.aborted).toBe(true);
});

it('从库存深链进入后切换组成物料，保留其他查询并只请求对应内容', () => {
  showDetail('card=stock&scope=exact');
  const tablist = document.querySelector('[role="tablist"][aria-label="产品详情内容"]');
  expect(tablist?.querySelector('[aria-selected="true"]')?.textContent).toBe('库存');
  const materials = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((item) => item.textContent === '组成物料');
  if (materials === undefined) throw new Error('没有组成物料页签');
  click(materials);
  expect(tablist?.querySelector('[aria-selected="true"]')?.textContent).toBe('组成物料');
  expect(textOf('output')).toBe('card=materials&scope=exact');
  expect(calls.map(({ url }) => url)).toEqual(['/api/v1/products/a/stock', '/api/v1/products/a/materials']);
});

function pressRight(target: HTMLElement): void {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
}

function showDetail(search: string) {
  installFetch();
  installMatchMedia();
  mounted = mount(memoryRouter(element(DetailHarness), `/products/a?${search}`));
}

function DetailHarness() {
  const [search, setParams] = useHostSearch();
  return element('div', { children: [
    element('output', { key: 'url', children: search.toString() }),
    element(ProductDetailBody, { key: 'detail', id: 'a', overview, search,
      patch: (params: Record<string, string | null>) => setParams(new URLSearchParams(writeUrlState(search.toString(), params))) }),
  ] });
}

const field = { value: '合成样品', provenance: { kind: 'system', rule: 'test', at: '2026-11-12T00:00:00.000Z' } } as const;
const overview: ProductOverview = {
  product: {
    id: 'a', barcodeRaw: '69701', barcodeBase: '69701', skuName: field, filingName: field, filingNo: field,
    netContent: field, casePack: field, outerSize: field, productLine: field, spuKey: null,
  },
  images: [], contacts: [],
  cards: {
    purchases: {
      open: 0, total: 0, byReportedStatus: {},
      byStage: { no_batch: 0, awaiting_date: 0, awaiting_shipment: 0, awaiting_receipt: 0, partially_received: 0, done: 0, cancelled: 0 },
    },
    stock: { kind: 'missing', reason: 'no_source', nextStep: null },
    materials: { kind: 'no_bom' },
  },
  bomHeader: null, handlingHints: [],
};
