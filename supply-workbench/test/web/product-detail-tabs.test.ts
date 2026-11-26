// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import type { ProductMaterials, ProductOverview } from '../../packages/contracts/src/index.js';
import { ProductDetailBody } from '../../apps/web/src/pages/products/ProductDetailBody.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { writeUrlState } from '../../apps/web/src/shared/hooks/url-state.js';
import { act, button, calls, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, useHostSearch, waitFor } from './party-preview-dom.js';

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
  expect(calls.map(({ url }) => url)).toEqual(['/api/v1/products/a/stock', '/api/v1/products/a/materials?owners=1']);
});

it('库存和组成物料摘要不清采购筛选，全部渠道采购摘要恢复默认范围', () => {
  showDetail('stage=awaiting_date&scope=exact');
  click(button('工厂库存›暂无匹配记录'));
  expect(textOf('output')).toBe('stage=awaiting_date&scope=exact&card=stock');
  clickTab('档案');
  click(button('组成物料›暂无BOM'));
  expect(textOf('output')).toBe('stage=awaiting_date&scope=exact&card=materials');
  clickTab('档案');
  click(button('采购订单›全部渠道·0行'));
  expect(textOf('output')).toBe('card=purchases');
});

it('包装图已被隐藏与原档未附图使用不同提示', () => {
  showDetail('', { images: [{ id: 'hidden', slot: 'outer', fileId: 'existing', source: 'import', hidden: true }] });
  const messages = [...document.querySelectorAll('[aria-label="包装图片"] figure')].map(figure => figure.textContent);
  expect(messages).toEqual(['内包装原档未附图', '外包装暂无可见图片']);
});

it('缺子件编码先指引维护 BOM，保存期间保持编辑框并在成功后回读负责人', async () => {
  showDetail('card=materials');
  const part = {
    partCodeRaw: '9900000001', partName: '合成子件', ownerName: '已有负责人',
    links: { materialLines: 0, demandRows: 0, customerSupplied: 0, inTransit: 0 }, usedByProducts: [], handlingHints: [],
  };
  const materials = { coverage: { linked: 0, total: 2 }, parts: [
    part, { ...part, partCodeRaw: '', partName: '旧表未填写编码', ownerName: null },
  ] } satisfies ProductMaterials;
  fulfill({ urlPart: '/materials?', status: 200, body: materials });
  await waitFor(() => textOf('tbody').includes('旧表未填写编码'));
  const uncoded = [...document.querySelectorAll('tbody tr')].find(row => row.textContent?.includes('旧表未填写编码'));
  expect(uncoded?.textContent).toContain('补齐子件编码后可指定');
  expect(uncoded?.querySelector('button')).toBeNull();

  click(button('修改子件负责人 9900000001'));
  click(button('保存负责人'));
  await waitFor(() => calls.some(({ url }) => url.endsWith('/owner')));
  const close = document.querySelector<HTMLButtonElement>('.ant-modal-close');
  expect(close?.disabled).toBe(true);
  act(() => { close?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(textOf('[role="dialog"]')).toContain('正在保存负责人');
  fulfill({ urlPart: '/owner', status: 200, body: { ownerName: '回写负责人' } });
  await waitFor(() => textOf('[role="dialog"]').includes('负责人已保存'));
  expect(close?.disabled).toBe(false);
  if (close === null) throw new Error('没有关闭按钮');
  click(close);
  expect(textOf('tbody')).toContain('回写负责人');
  click(button('修改子件负责人 9900000001'));
  expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe('回写负责人');
});

function pressRight(target: HTMLElement): void {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
}

function clickTab(label: string) {
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(item => item.textContent === label);
  if (tab === undefined) throw new Error(`没有页签 ${label}`);
  click(tab);
}

function showDetail(search: string, changes: Partial<ProductOverview> = {}) {
  installFetch();
  installMatchMedia();
  mounted = mount(memoryRouter(element(ActorRoles, { roles: ['admin'], children: element(DetailHarness, { value: { ...overview, ...changes } }) }), `/products/a?${search}`));
}

function DetailHarness({ value }: { readonly value: ProductOverview }) {
  const [search, setParams] = useHostSearch();
  return element('div', { children: [
    element('output', { key: 'url', children: search.toString() }),
    element(ProductDetailBody, { key: 'detail', id: 'a', overview: value, search,
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
