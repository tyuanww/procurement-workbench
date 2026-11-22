import { expect, it } from 'vitest';
import { classifyDemandOrder, generateBatchCandidates, localDate } from '../../packages/domain/src/index.js';

const day = localDate;

it('订单号不是可识别单号时，文字是块标签', () => {
  const labeled = classifyDemandOrder('宜侬达肤妍');
  expect(labeled.poRaw).toBeNull();
  expect(labeled.blockLabelRaw).toBe('宜侬达肤妍');
  expect(labeled.issues.map((issue) => issue.code)).toEqual(['PO_PLACEHOLDER']);
  expect(classifyDemandOrder('PO20260827000032').poRaw).toBe('PO20260827000032');
  expect(classifyDemandOrder('').issues).toEqual([]);
});

it('没有日期或没有数量的到货槽不生成批次', () => {
  const candidates = generateBatchCandidates([
    {
      rowId: 'row-1',
      blockMaterialPoRaw: '3500-202609700002',
      itemCodeRaw: '30037001',
      slots: [
        { index: 0, date: day('2026-09-20'), qty: 10 },
        { index: 1, date: null, qty: 5 },
        { index: 2, date: day('2026-09-21'), qty: null },
      ],
    },
  ]);
  expect(candidates).toEqual([
    {
      blockMaterialPoRaw: '3500-202609700002',
      itemCodeRaw: '30037001',
      rowId: 'row-1',
      slotIndex: 0,
      date: day('2026-09-20'),
      qty: 10,
    },
  ]);
});
