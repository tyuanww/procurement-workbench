import { describe, expect, it } from 'vitest';
import { followUpCount, nudgeText, type NudgeLine } from '../../apps/web/src/features/today/nudge-text/model/text.js';

const base = { poRaw: 'PO1', nameRaw: '面膜', qty: 10, dueDate: '2026-10-12', overdueDays: null };

describe('催办文本', () => {
  it('未确认、已确认、逾期、今日应到、已发待收各有一句', () => {
    const lines: NudgeLine[] = [
      { ...base, status: 'unconfirmed', dueDate: null },
      { ...base, status: 'confirmed' },
      { ...base, status: 'overdue', overdueDays: 4 },
      { ...base, status: 'due_today' },
      { ...base, status: 'shipped' },
    ];
    const text = nudgeText({ waitingName: '宜侬', buyerName: '样例采购员', lines });
    expect(text.startsWith('【SHINEMAGE 采购】')).toBe(true);
    expect(text).toContain('尚未确认到货日');
    expect(text).toContain('已确认未到');
    expect(text).toContain('已逾期 4 天');
    expect(text).toContain('今天应到');
    expect(text).toContain('已发待收');
    expect(text).toContain('请回复收货情况');
    expect(text).toContain('谢谢！— 样例采购员');
  });

  it('采购员名字为空时不写破折号和空署名', () => {
    const text = nudgeText({ waitingName: '宜侬', buyerName: '', lines: [baseLine('confirmed')] });
    expect(text.endsWith('谢谢！')).toBe(true);
    expect(text).not.toContain('谢谢！—');
  });

  it('勾选记跟进时条数等于批次数', () => {
    expect(followUpCount([baseLine('overdue'), baseLine('shipped')], true)).toBe(2);
    expect(followUpCount([baseLine('overdue')], false)).toBe(0);
  });
});

function baseLine(status: NudgeLine['status']): NudgeLine {
  return { ...base, status };
}
