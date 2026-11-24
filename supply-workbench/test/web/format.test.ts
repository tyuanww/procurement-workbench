import { describe, expect, it } from 'vitest';
import { formatDateTime, formatMoney, formatQuantity, formatTableDate } from '../../apps/web/src/shared/ui/format.js';

const NOW = new Date('2026-11-03T00:00:00+08:00');

describe('表格日期', () => {
  it('同年只写 MM-DD，跨年写完整日期', () => {
    expect(formatTableDate({ iso: '2026-10-01', now: NOW })).toBe('10-01');
    expect(formatTableDate({ iso: '2026-01-02', now: NOW })).toBe('01-02');
    expect(formatTableDate({ iso: '2025-10-01', now: NOW })).toBe('2025-10-01');
    expect(formatTableDate({ iso: '2027-03-04', now: NOW })).toBe('2027-03-04');
  });

  it('带时区的时刻按上海日期取年月日', () => {
    expect(formatTableDate({ iso: '2026-11-03T15:59:59.000Z', now: NOW })).toBe('11-03');
    expect(formatTableDate({ iso: '2026-11-03T16:00:00.000Z', now: NOW })).toBe('11-04');
    expect(formatTableDate({ iso: '2025-12-31T16:00:00.000Z', now: NOW })).toBe('01-01');
  });

  it('缺值和无法识别的日期写成破折号', () => {
    expect(formatTableDate({ iso: null, now: NOW })).toBe('—');
    expect(formatTableDate({ iso: '', now: NOW })).toBe('—');
    expect(formatTableDate({ iso: '不是日期', now: NOW })).toBe('—');
    expect(formatTableDate({ iso: '2026-11-03T20:09', now: NOW })).toBe('—');
  });
});

describe('详情时间', () => {
  it('按上海时区写 YYYY-MM-DD HH:mm，24 小时制', () => {
    expect(formatDateTime('2026-11-03T16:00:00.000Z')).toBe('2026-11-04 00:00');
    expect(formatDateTime('2026-11-03T20:09Z')).toBe('2026-11-04 04:09');
    expect(formatDateTime('2026-10-06T00:00:00.000Z')).toBe('2026-10-06 08:00');
  });

  it('没时区或非法时刻返回 null，由调用方写原因', () => {
    expect(formatDateTime('2026-11-03T20:09')).toBeNull();
    expect(formatDateTime('不是时间')).toBeNull();
    expect(formatDateTime(null)).toBeNull();
  });
});

describe('数量与金额', () => {
  it('数量按 zh-CN 千分位，整数不带小数', () => {
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(1234567)).toBe('1,234,567');
    expect(formatQuantity(1.5)).toBe('1.5');
    expect(formatQuantity(0.0001)).toBe('0.0001');
    expect(formatQuantity(-1200)).toBe('-1,200');
    expect(formatQuantity(null)).toBe('—');
    expect(formatQuantity(Number.NaN)).toBe('—');
  });

  it('金额带 ¥ 和两位小数', () => {
    expect(formatMoney(0)).toBe('¥0.00');
    expect(formatMoney(1234.5)).toBe('¥1,234.50');
    expect(formatMoney(null)).toBe('—');
  });
});
