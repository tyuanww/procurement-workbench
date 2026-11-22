import { describe, expect, it } from 'vitest';
import { adoptShipmentPrefill, batchLineText, buyerUndo, dateChangeNeedsReason, missingDeliveredText, timelineLineText } from '../../apps/web/src/features/follow-up/line-detail/rules.js';

describe('订单行详情规则', () => {
  it('第一次设确认日不要原因，再改必须写原因', () => {
    expect(dateChangeNeedsReason({ hadDate: false, reason: '' })).toBe(false);
    expect(dateChangeNeedsReason({ hadDate: true, reason: '' })).toBe(true);
    expect(dateChangeNeedsReason({ hadDate: true, reason: '工厂延期' })).toBe(false);
  });

  it('派生 0 写明代工厂表无对应记录，采纳出货行预填数量和日期', () => {
    expect(missingDeliveredText()).toBe('代工厂表无对应记录');
    expect(adoptShipmentPrefill({ qty: 8, shippedOn: '2026-10-06' })).toEqual({ qty: 8, shippedOn: '2026-10-06' });
  });

  it('改负责人可以撤销回上一个', () => {
    expect(buyerUndo('样例采购员', '甲').canUndo).toBe(true);
    expect(buyerUndo('样例采购员', '样例采购员').canUndo).toBe(false);
  });

  it('批次行用中文状态，确认日空着仍是未设', () => {
    const line = batchLineText({ seq: 3, status: 'shipped', dateBuyerConfirmed: null });
    expect(line).toBe('3 · 已发货 · 确认 未设');
    expect(line.includes('shipped')).toBe(false);
    expect(batchLineText({ seq: 3, status: 'shipped', dateBuyerConfirmed: '2026-10-01' })).toBe('3 · 已发货 · 确认 2026-10-01');
  });

  it('时间线按上海时间显示到分钟，作废不带钟点', () => {
    expect(timelineLineText({ kind: 'shipment', voided: false, at: '2026-11-03T20:09Z' })).toBe('发货 2026-11-04 04:09');
    expect(timelineLineText({ kind: 'shipment', voided: false, at: '2026-11-03T20:09' })).toBe('发货 时间无法识别');
    expect(timelineLineText({ kind: 'shipment', voided: false, at: '2026-11-03T16:00:00.000Z' })).toBe('发货 2026-11-04 00:00');
    expect(timelineLineText({ kind: 'shipment', voided: false, at: '2026-11-03T15:59:00.000Z' })).toBe('发货 2026-11-03 23:59');
    expect(timelineLineText({ kind: 'shipment', voided: false, at: '2026-10-06T00:00:00.000Z' })).toBe('发货 2026-10-06 08:00');
    expect(timelineLineText({ kind: 'shipment', voided: true, at: '2026-10-06T00:00:00.000Z' })).toBe('发货 已作废');
    expect(timelineLineText({ kind: 'shipment', voided: false, at: '不是时间' })).toBe('发货 时间无法识别');
    const shown = timelineLineText({ kind: 'shipment', voided: false, at: '2026-10-06T00:00:00.000Z' });
    expect(shown.includes('shipment')).toBe(false);
    expect(shown.includes('T')).toBe(false);
  });
});
