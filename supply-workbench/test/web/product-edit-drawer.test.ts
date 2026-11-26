// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { ProductEditDrawer, type ProductEditDrawerProps } from '../../apps/web/src/pages/products/ProductEditDrawer.js';
import { readProductEdit, writeProductEdit, writeWorkbookBatch } from '../../apps/web/src/pages/products/product-edit-url.js';
import type { WorkbookBatch } from '../../apps/web/src/pages/products/product-workbook-api.js';
import { drawerWide } from '../../apps/web/src/theme/tokens.js';
import { act, button, calls, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, useHostState, waitFor } from './party-preview-dom.js';

describe('产品编辑抽屉的 URL 状态', () => {
  it('打开只加 drawer=edit，card、scope、stage 都保留', () => {
    const next = writeProductEdit({ search: '?card=purchases&scope=exact&stage=confirmed', isOpen: true });
    expect(next.toString()).toBe('card=purchases&scope=exact&stage=confirmed&drawer=edit');
  });

  it('关闭只删 drawer，card、scope、stage 不动', () => {
    const next = writeProductEdit({ search: '?card=purchases&scope=exact&stage=confirmed&drawer=edit', isOpen: false });
    expect(next.toString()).toBe('card=purchases&scope=exact&stage=confirmed');
    expect(next.has('drawer')).toBe(false);
  });

  it('打开时没有其他参数也能得到 drawer=edit，不重复写', () => {
    expect(writeProductEdit({ search: '', isOpen: true }).toString()).toBe('drawer=edit');
    expect(writeProductEdit({ search: 'drawer=edit', isOpen: true }).toString()).toBe('drawer=edit');
  });

  it('readProductEdit 只认 edit，其他值和非法值都返回 false', () => {
    expect(readProductEdit('?drawer=edit')).toBe(true);
    expect(readProductEdit('drawer=edit')).toBe(true);
    expect(readProductEdit('?drawer=ship')).toBe(false);
    expect(readProductEdit('?drawer=EDIT')).toBe(false);
    expect(readProductEdit('?drawer=')).toBe(false);
    expect(readProductEdit('?card=purchases&scope=exact')).toBe(false);
    expect(readProductEdit('')).toBe(false);
  });

  it('回执批次可随 URL 恢复，关闭抽屉仍可重新打开回执，清空批次保留原筛选', () => {
    const saved = writeWorkbookBatch({ search: '?card=materials&drawer=edit', batchId: 'batch-1' });
    expect(saved.toString()).toBe('card=materials&drawer=edit&workbookBatch=batch-1');
    const closed = writeProductEdit({ search: saved.toString(), isOpen: false });
    expect(closed.toString()).toBe('card=materials&workbookBatch=batch-1');
    expect(writeWorkbookBatch({ search: saved.toString(), batchId: null }).toString()).toBe('card=materials&drawer=edit');
  });

  it('编辑抽屉宽度用 720 的 token，480 不动', () => {
    expect(drawerWide).toBe(720);
  });
});

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  await act(() => mounted?.unmount());
  mounted = undefined;
  resetDom();
});

it('列表回读预览后聚焦新增影响，并在确认前显示新增款数', async () => {
  showBatch(null);
  fulfill({ urlPart: '/api/v1/products/workbook-imports/batch-1', status: 200, body: {
    ...draft, products: [
      { id: null, barcode: '0690000012345-3', name: '三号渠道装', changes: [{ section: 'product', label: 'SKU名称', before: null, after: '三号渠道装' }] },
      { id: null, barcode: '0690000012346', name: '新产品', changes: [{ section: 'product', label: 'SKU名称', before: null, after: '新产品' }] },
    ],
  } });
  await waitFor(() => document.activeElement?.textContent?.includes('将新增 2 款产品') === true);
  expect(textOf('[role="dialog"] h1')).toBe('新建产品');
  expect(button('确认新增2款').disabled).toBe(false);
});

it('详情回读预览后聚焦更新影响，单张原图与新图在同一差异行', async () => {
  showBatch(overview);
  fulfill({ urlPart: '/api/v1/products/channel/workbook-imports/batch-1', status: 200, body: {
    ...draft, products: [{ id: 'channel', barcode: overview.product.barcodeRaw, name: '渠道合成装', changes: [
      { section: 'image', label: '外包装图片', before: '可见图片', after: '隐藏', beforeImageUrl: '/current.png' },
      { section: 'image', label: '外包装图片', before: null, after: '新增图片', afterImageUrl: '/incoming.png' },
    ] }],
  } });
  await waitFor(() => document.activeElement?.textContent?.includes('将更新此产品') === true);
  expect(textOf('[role="dialog"] h1')).toBe('更新此产品');
  expect(document.activeElement?.textContent).toContain('共 1 项变更');
  expect(button('确认更新此产品').disabled).toBe(false);
  const rows = document.querySelectorAll('[aria-label="包装图片"] dl');
  expect(rows).toHaveLength(1);
  expect(rows[0]?.querySelector('img[alt="当前包装图片"]')?.getAttribute('src')).toBe('/current.png');
  expect(rows[0]?.querySelector('img[alt="导入包装图片"]')?.getAttribute('src')).toBe('/incoming.png');
});

it('详情恢复旧的越界预览时聚焦行错误，显示完整条码并移除确认动作', async () => {
  showBatch(overview);
  fulfill({ urlPart: '/api/v1/products/channel/workbook-imports/batch-1', status: 200, body: {
    ...draft, status: 'stale', issues: [
      { sheet: '组成物料', row: 3, field: '产品条码', message: '这一行的完整条码是 0690000012345-3，此处只接受 0690000012345-2。' },
    ],
  } });
  await waitFor(() => document.activeElement?.getAttribute('aria-label') === '工作簿问题');
  expect(document.activeElement?.textContent).toContain('组成物料 · 第 3 行 · 产品条码');
  expect(document.activeElement?.textContent).toContain('0690000012345-3，此处只接受 0690000012345-2');
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('确认更新此产品');
  expect(button('选择新文件').disabled).toBe(false);
});

it('关闭后重开先回读服务器，已提交批次使用导入前后并允许重试包装图', async () => {
  showInteractive({ initialBatchId: draft.id });
  fulfill({ urlPart: '/workbook-imports/batch-1', status: 200, body: draft });
  await waitFor(() => textOf('[role="dialog"]').includes('确认新增'));
  click(button('关闭'));
  click(button('打开Excel'));
  expect(textOf('[role="dialog"]')).toContain('正在读取导入批次');
  expect(textOf('[role="dialog"]')).not.toContain('确认新增');
  fulfill({ urlPart: '/workbook-imports/batch-1', status: 200, body: committed });
  await waitFor(() => textOf('[role="dialog"]').includes('已新增 1 款产品'));
  expect(textOf('[aria-label="包装图片"] dl')).toContain('导入前');
  expect(textOf('[aria-label="包装图片"] dl')).toContain('导入后');
  const before = document.querySelector('img[alt="导入前包装图片"]');
  expect(before?.getAttribute('src')).toBe('/current.png');
  act(() => { before?.dispatchEvent(new Event('error')); });
  click(button('重试加载导入前包装图片'));
  expect(document.querySelector('img[alt="导入前包装图片"]')?.getAttribute('src')).toBe('/current.png');
});

it('提交期间浏览历史移除批次，成功后仍回读档案且不重新打开旧预览', async () => {
  showInteractive({ initialBatchId: draft.id });
  fulfill({ urlPart: '/workbook-imports/batch-1', status: 200, body: { ...committed, status: 'ready' } });
  await waitFor(() => textOf('[role="dialog"]').includes('确认新增'));
  click(button('确认新增1款'));
  await waitFor(() => calls.some(({ url }) => url.endsWith('/batch-1/commit')));
  click(button('返回无批次历史'));
  fulfill({ urlPart: '/batch-1/commit', status: 200, body: committed });
  await waitFor(() => textOf('output') === '1');
  expect(textOf('[role="dialog"]')).toContain('上传产品档案工作簿');
  expect(textOf('[role="dialog"]')).not.toContain('已新增');
});

it('重传找回已提交回执时刷新档案，下载模板期间暂停生成预览', async () => {
  showInteractive({ initialBatchId: null });
  const fileInput = document.querySelector<HTMLInputElement>('.dossier-workbook-dropzone input[type=file]');
  if (fileInput === null) throw new Error('没有 Excel 上传控件');
  Object.defineProperty(fileInput, 'files', { value: [new File(['synthetic'], '合成产品.xlsx')] });
  act(() => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); });
  click(button('下载Excel模板'));
  expect(button('生成预览').disabled).toBe(true);
  fulfill({ urlPart: '/workbook-import-template', status: 500, body: {} });
  await waitFor(() => textOf('[role="dialog"]').includes('模板没有下载'));
  expect(button('生成预览').disabled).toBe(false);
  click(button('生成预览'));
  await waitFor(() => calls.some(({ url }) => url.endsWith('/workbook-imports')));
  fulfill({ urlPart: '/workbook-imports', status: 200, body: committed });
  await waitFor(() => textOf('[role="dialog"]').includes('已新增 1 款产品'));
  expect(textOf('output')).toBe('1');
  expect(textOf('[role="dialog"]')).not.toContain('模板没有下载');
});

function showInteractive({ initialBatchId }: { readonly initialBatchId: string | null }) {
  installFetch();
  installMatchMedia();
  function Harness() {
    const [batchId, setBatchId] = useHostState(initialBatchId);
    const [isOpen, setOpen] = useHostState(true);
    const [revision, setRevision] = useHostState(0);
    const props: ProductEditDrawerProps = {
      product: null, isOpen, batchId, onClose: () => setOpen(false), setBatchId,
      onCommitted: () => setRevision(value => value + 1),
      receiptDestination: (id) => ({ to: `/products/${id}`, state: null }),
    };
    return element('div', { children: [
      element('button', { key: 'open', onClick: () => setOpen(true), children: '打开 Excel' }),
      element('button', { key: 'history', onClick: () => setBatchId(null), children: '返回无批次历史' }),
      element('output', { key: 'revision', children: revision }),
      element(ProductEditDrawer, { key: 'drawer', ...props }),
    ] });
  }
  mounted = mount(memoryRouter(element(Harness), '/products'));
}

function showBatch(product: ProductEditDrawerProps['product']) {
  installFetch();
  installMatchMedia();
  const props: ProductEditDrawerProps = {
    product, isOpen: true, batchId: 'batch-1', onClose() {}, setBatchId() {}, onCommitted() {},
    receiptDestination: (id) => ({ to: `/products/${id}`, state: null }),
  };
  mounted = mount(memoryRouter(element(ProductEditDrawer, props), '/products?drawer=edit&workbookBatch=batch-1'));
}

const draft = { id: 'batch-1', fileName: '合成产品.xlsx', status: 'ready', issues: [], products: [] } satisfies WorkbookBatch;
const committed = { ...draft, status: 'committed', products: [{
  id: 'new', barcode: '0690000012345', name: '合成商品', changes: [
    { section: 'image', label: '外包装图片', before: '原图', after: '换图', beforeImageUrl: '/current.png', afterImageUrl: '/incoming.png' },
  ],
}] } satisfies WorkbookBatch;
const field = { value: '渠道合成装', provenance: { kind: 'system', rule: 'test', at: '2026-11-12T00:00:00.000Z' } } as const;
const overview = {
  product: {
    id: 'channel', barcodeRaw: '0690000012345-2', barcodeBase: '0690000012345', skuName: field, filingName: field, filingNo: field,
    netContent: field, casePack: field, outerSize: field, productLine: field, spuKey: null,
  },
  images: [], contacts: [], bomHeader: null, handlingHints: [],
  cards: {
    purchases: {
      open: 0, total: 0, byReportedStatus: {},
      byStage: { no_batch: 0, awaiting_date: 0, awaiting_shipment: 0, awaiting_receipt: 0, partially_received: 0, done: 0, cancelled: 0 },
    },
    stock: { kind: 'missing', reason: 'no_source', nextStep: null },
    materials: { kind: 'no_bom' },
  },
} satisfies NonNullable<ProductEditDrawerProps['product']>;
