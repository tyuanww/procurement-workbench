import { describe, expect, it } from 'vitest';
import { linkNeedsConfirm, multiNameChoice, needsForbiddenConfirm, roleChoice } from '../../apps/web/src/features/master-data/model/review.js';

describe('主数据审核', () => {
  it('禁止合并组合没确认就不能通过', () => {
    expect(needsForbiddenConfirm({ isForbidden: true, confirmed: false })).toBe(true);
    expect(needsForbiddenConfirm({ isForbidden: true, confirmed: true })).toBe(false);
    expect(needsForbiddenConfirm({ isForbidden: false, confirmed: false })).toBe(false);
  });

  it('一号多名有两种处理，主体匹配分别确认名称和角色', () => {
    expect(multiNameChoice('same_item', '面膜')).toEqual({ mode: 'same_item', displayName: '面膜' });
    expect(multiNameChoice('shared_code', '')).toEqual({ mode: 'shared_code' });
    expect(linkNeedsConfirm({ rawName: '怡龙', partyName: '宜侬', confirmed: false })).toBe(true);
    expect(linkNeedsConfirm({ rawName: '怡龙', partyName: '宜侬', confirmed: true })).toBe(false);
    expect(linkNeedsConfirm({ rawName: '宜侬', partyName: '宜侬', confirmed: false })).toBe(false);
    expect(roleChoice({ isSupplier: false, isFactory: false })).toBeNull();
    expect(roleChoice({ isSupplier: true, isFactory: false })).toEqual({ isSupplier: true, isFactory: false });
  });
});
