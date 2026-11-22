import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { ProductCard } from '../../apps/web/src/pages/products/product-cards.js';
import { cardMetrics, ProductCards, productViewOf, thumbnailSrc } from '../../apps/web/src/pages/products/product-cards.js';
import {
  initialColumnWidths,
  MAX_COLUMN_WIDTH,
  nextColumnWidth,
  ProductTable,
  PRODUCT_COLUMN_SPECS,
  tableScrollWidth,
  widthOf,
} from '../../apps/web/src/pages/products/product-table.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const react = requireWeb('react');
const server = requireWeb('react-dom/server');
const router = requireWeb('react-router');

const BASE: ProductCard = {
  id: 'product-1',
  skuName: '海葡萄面膜',
  filingName: null,
  barcodeRaw: '6975001',
  isChannelVariant: false,
  netContent: '25ml',
  casePack: '10片/盒',
  thumbnail: null,
  openPurchaseLines: { allChannels: 3, reportedInProgress: 2 },
  factoryStock: {
    value: null,
    missingReason: 'no_source',
    provenance: { kind: 'system', rule: 'factory-stock', at: '2026-11-01T00:00:00.000Z' },
  },
  bomPartCount: null,
  materialLinkCoverage: null,
  contactsAssigned: 1,
};

const FULL: ProductCard = {
  ...BASE,
  isChannelVariant: true,
  thumbnail: { fileId: 'file-9' },
  factoryStock: { value: 12.5, provenance: { kind: 'system', rule: 'factory-stock', at: '2026-11-01T00:00:00.000Z' } },
  bomPartCount: 4,
  materialLinkCoverage: { linked: 2, total: 3 },
  contactsAssigned: 0,
};

describe('产品列表默认视图', () => {
  it('无 view 或 view=card 是卡片，只有 view=table 才表格', () => {
    expect(productViewOf(new URLSearchParams(''))).toBe('card');
    expect(productViewOf(new URLSearchParams('view=card'))).toBe('card');
    expect(productViewOf(new URLSearchParams('view=table'))).toBe('table');
  });

  it('未知或大小写不对的 view 回落到卡片', () => {
    expect(productViewOf(new URLSearchParams('view=bogus'))).toBe('card');
    expect(productViewOf(new URLSearchParams('view=TABLE'))).toBe('card');
    expect(productViewOf(new URLSearchParams('view='))).toBe('card');
  });
});

describe('产品卡片图片', () => {
  it('有缩略图时拼 /files/<fileId>，没有缩略图返回 null 走占位', () => {
    expect(thumbnailSrc(null)).toBeNull();
    expect(thumbnailSrc({ fileId: 'abc-123' })).toBe('/files/abc-123');
    expect(thumbnailSrc(FULL.thumbnail)).toBe('/files/file-9');
  });
});

describe('产品卡片指标', () => {
  it('四个指标顺序固定，缺值显示 U+2014 而不是 0', () => {
    const metrics = cardMetrics(BASE);
    expect(metrics.map((metric) => metric.label)).toEqual(['采购中', '工厂库存', 'BOM', '联系人']);
    expect(metrics.map((metric) => metric.value)).toEqual(['2', '—', '—', '1']);
  });

  it('有值照实显示，0 保留为 0', () => {
    const values = cardMetrics(FULL).map((metric) => metric.value);
    expect(values).toEqual(['2', '12.5', '4', '0']);
  });
});

describe('产品表格列宽', () => {
  it('品名和条码保留足够宽度，所有列宽不小于各自最小值', () => {
    expect(PRODUCT_COLUMN_SPECS.map((spec) => spec.title)).toEqual([
      '品名', '条码', '备案名', '净含量', '箱规', '采购中', '工厂库存', 'BOM 子件', '物料关联', '联系人', '规格',
    ]);
    const name = PRODUCT_COLUMN_SPECS.find((spec) => spec.key === 'skuName');
    const barcode = PRODUCT_COLUMN_SPECS.find((spec) => spec.key === 'barcodeRaw');
    expect(name?.width).toBeGreaterThanOrEqual(160);
    expect(barcode?.width).toBeGreaterThanOrEqual(120);
    expect(PRODUCT_COLUMN_SPECS.every((spec) => spec.width >= spec.minWidth && spec.minWidth > 0)).toBe(true);
  });

  it('手机端隐藏除品名、条码、采购中、工厂库存以外的列', () => {
    const hidden = PRODUCT_COLUMN_SPECS.filter((spec) => spec.isPhoneHidden).map((spec) => spec.key);
    expect(hidden).toEqual(['filingName', 'netContent', 'casePack', 'bomPartCount', 'materialCoverage', 'contactsAssigned', 'spec']);
  });

  it('初始宽度等于设计宽度，表格最小宽度按可见列求和', () => {
    const widths = initialColumnWidths();
    expect(PRODUCT_COLUMN_SPECS.map((spec) => widthOf(widths, spec))).toEqual(PRODUCT_COLUMN_SPECS.map((spec) => spec.width));
    expect(tableScrollWidth({ widths, isPhone: false })).toBe(1364);
    expect(tableScrollWidth({ widths, isPhone: true })).toBe(584);
  });

  it('拖动后表格最小宽度跟随列宽变化，缺列回落到设计宽度', () => {
    const widths = { ...initialColumnWidths(), skuName: 300 };
    expect(widthOf(widths, specOf('skuName'))).toBe(300);
    expect(tableScrollWidth({ widths, isPhone: false })).toBe(1424);
    expect(tableScrollWidth({ widths, isPhone: true })).toBe(644);
    expect(widthOf({}, specOf('barcodeRaw'))).toBe(160);
  });

  it('拖动列宽夹在最小值和最大值之间，并取整', () => {
    expect(nextColumnWidth({ startWidth: 240, deltaX: 60, minWidth: 120 })).toBe(300);
    expect(nextColumnWidth({ startWidth: 240, deltaX: -1000, minWidth: 120 })).toBe(120);
    expect(nextColumnWidth({ startWidth: 240, deltaX: 1000, minWidth: 72 })).toBe(MAX_COLUMN_WIDTH);
    expect(nextColumnWidth({ startWidth: 240, deltaX: 10.4, minWidth: 72 })).toBe(250);
    expect(nextColumnWidth({ startWidth: MAX_COLUMN_WIDTH, deltaX: 100, minWidth: 72 })).toBe(MAX_COLUMN_WIDTH);
  });
});

describe('产品卡片渲染', () => {
  it('有图用 /files 地址，整卡链到详情，指标和渠道规格都在', () => {
    const html = markup(h(ProductCards, { items: [FULL] }));
    expect(html).toContain('href="/products/product-1"');
    expect(html).toContain('src="/files/file-9"');
    expect(html).toContain('渠道规格');
    expect(html).toContain('海葡萄面膜');
    expect(html).toContain('6975001');
    expect(html).toContain('净含量 25ml');
    expect(html).toContain('箱规 10片/盒');
    for (const label of ['采购中', '工厂库存', 'BOM', '联系人']) expect(html).toContain(label);
    expect(html).not.toContain('无图');
  });

  it('没有缩略图时是占位，不出现破图地址', () => {
    const html = markup(h(ProductCards, { items: [BASE] }));
    expect(html).toContain('aria-label="海葡萄面膜 无图"');
    expect(html).not.toContain('/files/');
    expect(html).toContain('href="/products/product-1"');
  });
});

describe('产品表格渲染', () => {
  it('用 antd Table，品名列链到详情，桌面端有列宽拖动柄', () => {
    const html = markup(h(ProductTable, { items: [BASE, FULL] }));
    expect(html).toContain('ant-table');
    expect(html).toContain('href="/products/product-1"');
    for (const title of ['品名', '条码', '工厂库存', 'BOM 子件']) expect(html).toContain(title);
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-label="调整品名列宽"');
    expect(html).not.toContain('ant-table-row-expand-icon');
  });
});

function markup(node: unknown): string {
  const html = server.renderToStaticMarkup(react.createElement(router.MemoryRouter, { children: node }));
  if (typeof html !== 'string') throw new Error('没有渲染出 HTML');
  return html;
}

function h(type: unknown, props: unknown): unknown {
  return react.createElement(type, props);
}

function specOf(key: string) {
  const found = PRODUCT_COLUMN_SPECS.find((spec) => spec.key === key);
  if (found === undefined) throw new Error(`没有这一列：${key}`);
  return found;
}
