import { describe, expect, it } from 'vitest';
import { catalogTemplate, TEMPLATE_LABELS, templateCells } from '../../apps/web/src/features/product-archive/browse/template.js';

describe('产品资料模板', () => {
  it('六格都在，空着写待补充', () => {
    const cells = templateCells();
    expect(cells.map((cell) => cell.label)).toEqual([...TEMPLATE_LABELS]);
    expect(cells.every((cell) => cell.value === '待补充')).toBe(true);
  });

  it('已有的 SKU 和条码照实显示', () => {
    const cells = templateCells({ skuName: '棉片', barcode: '6901' });
    expect(cells.find((cell) => cell.label === 'SKU')?.value).toBe('棉片');
    expect(cells.find((cell) => cell.label === '条码')?.value).toBe('6901');
    expect(cells.find((cell) => cell.label === '周期')?.value).toBe('待补充');
  });

  it('已有备案名照实显示，空白备案名和供应商仍是待补充', () => {
    const named = templateCells(catalogTemplate({
      skuName: '冰冰贴',
      barcodeRaw: '6901',
      filingName: '店铺甲海葡萄水光冰冰贴',
      thumbnail: null,
    }));
    expect(named.find((cell) => cell.label === '备案名称')?.value).toBe('店铺甲海葡萄水光冰冰贴');
    expect(named.find((cell) => cell.label === '供应商')?.value).toBe('待补充');
    expect(named.find((cell) => cell.label === '周期')?.value).toBe('待补充');
    const blank = templateCells(catalogTemplate({
      skuName: '冰冰贴',
      barcodeRaw: '6901',
      filingName: '   ',
      thumbnail: null,
    }));
    expect(blank.find((cell) => cell.label === '备案名称')?.value).toBe('待补充');
  });
});
