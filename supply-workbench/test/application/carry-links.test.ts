import { expect, it } from 'vitest';
import { fingerprintOnRow, linksToCarry, type CarryLink } from '../../packages/application/src/imports/commit/carry-links.js';

const linked = (id: string, status: 'linked' | 'manual' = 'linked'): CarryLink => ({ linkedOrderLineId: id, linkStatus: status, linkReason: null });

it('指纹在解析行上，读序反过来也不串日期格', () => {
  const later = fingerprintOnRow({ id: 'row-1002', parsed: { day: '2026-10-02', qty: 2, fingerprint: 'fp-1002' } });
  const earlier = fingerprintOnRow({ id: 'row-1001', parsed: { day: '2026-10-01', qty: 1, fingerprint: 'fp-1001' } });
  const carried = linksToCarry({
    current: [
      { fingerprint: later, sheetName: '排产计划', rowNo: 8, unchanged: true },
      { fingerprint: earlier, sheetName: '排产计划', rowNo: 8, unchanged: true },
    ],
    previous: [
      { fingerprint: 'fp-1001', sheetName: '排产计划', rowNo: 8, link: linked('line-1') },
      { fingerprint: 'fp-1002', sheetName: '排产计划', rowNo: 8, link: linked('line-2', 'manual') },
    ],
  });
  expect(carried.map((item) => item?.linkedOrderLineId)).toEqual(['line-2', 'line-1']);
  expect(carried.map((item) => item?.linkStatus)).toEqual(['manual', 'linked']);
});

it('数量变化是新指纹，不继承；同一指纹重复时不挑一个', () => {
  const changed = fingerprintOnRow({ id: 'qty', parsed: { fingerprint: 'day-1-qty-9' } });
  expect(linksToCarry({
    current: [{ fingerprint: changed, sheetName: '排产计划', rowNo: 8, unchanged: true }],
    previous: [{ fingerprint: 'day-1-qty-4', sheetName: '排产计划', rowNo: 8, link: linked('line-1') }],
  })).toEqual([null]);
  const duplicate = fingerprintOnRow({ id: 'dup', parsed: { fingerprint: 'same' } });
  expect(linksToCarry({
    current: [{ fingerprint: duplicate, sheetName: '排产计划', rowNo: 4, unchanged: true }],
    previous: [
      { fingerprint: 'same', sheetName: '排产计划', rowNo: 4, link: linked('line-1') },
      { fingerprint: 'same', sheetName: '排产计划', rowNo: 9, link: linked('line-2', 'manual') },
    ],
  })).toEqual([null]);
});

it('没有行上指纹时，只有表行号在两边都唯一才沿用旧继承', () => {
  const fallback = fingerprintOnRow({ id: 'b2-r1', parsed: {} });
  expect(fallback).toEqual({ value: 'row:b2-r1', fromFile: false });
  const carried = linksToCarry({
    current: [{ fingerprint: fallback, sheetName: '成品出货明细', rowNo: 2, unchanged: true }],
    previous: [{ fingerprint: 'row:b1-r1', sheetName: '成品出货明细', rowNo: 2, link: linked('line-1') }],
  });
  expect(carried[0]?.linkedOrderLineId).toBe('line-1');
});
