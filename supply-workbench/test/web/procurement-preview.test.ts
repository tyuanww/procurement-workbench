import { expect, it } from 'vitest';
import { visibleProcurement } from '../../apps/web/src/pages/imports/procurement-preview-model.js';

it('总表预览按合法 PO 规范单号去重并保留原文', () => {
  const oa = 'XPKA(CN)0110';
  const source = { sheetName: '采购订单总表', rowNo: 2 };
  const po = 'PO20260101000001；PO20260101000002';
  const first = { source, oaRaw: oa, oaRefs: [], productCodeRaw: null, productNameRaw: null, poRaw: po, quantity: 100 };
  const rawNumbers = [po, 'ｐｏ ２０２６０１０１０００００１', '待确认'];
  const result = visibleProcurement({
    oa, groups: [{ oa, count: 3 }], componentFacts: [], links: [],
    finishedRows: rawNumbers.map((poRaw, index) => ({ ...first, poRaw, source: { ...source, rowNo: index + 2 } })),
  });

  expect(result.poCount).toBe(2);
  expect(result.rows.map((row) => row.poRaw)).toEqual(rawNumbers);
});
