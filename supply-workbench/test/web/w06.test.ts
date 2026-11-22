import { describe, expect, it } from 'vitest';
import { linkNeedsConfirm, multiNameChoice, needsForbiddenConfirm, PARTY_TABS, partyTabLabel, roleChoice } from '../../apps/web/src/features/master-data/model/review.js';

describe('主数据审核', () => {
  it('禁止合并组合没确认就不能通过', () => {
    expect(needsForbiddenConfirm({ isForbidden: true, confirmed: false })).toBe(true);
    expect(needsForbiddenConfirm({ isForbidden: true, confirmed: true })).toBe(false);
    expect(needsForbiddenConfirm({ isForbidden: false, confirmed: false })).toBe(false);
  });

  it('一号多名有两种处理，主体页有各标签', () => {
    expect(multiNameChoice('same_item', '面膜')).toEqual({ mode: 'same_item', displayName: '面膜' });
    expect(multiNameChoice('shared_code', '')).toEqual({ mode: 'shared_code' });
    expect(PARTY_TABS).toEqual(['aliases', 'orders', 'factory', 'kpis']);
    expect(PARTY_TABS.map((tab) => partyTabLabel(tab))).toEqual(['别名', '订单', '代工厂', '指标']);
    expect(linkNeedsConfirm({ rawName: '甲包装厂', partyName: '甲代工厂', confirmed: false })).toBe(true);
    expect(linkNeedsConfirm({ rawName: '甲包装厂', partyName: '甲代工厂', confirmed: true })).toBe(false);
    expect(linkNeedsConfirm({ rawName: '甲代工厂', partyName: '甲代工厂', confirmed: false })).toBe(false);
    expect(roleChoice({ isSupplier: false, isFactory: false })).toBeNull();
    expect(roleChoice({ isSupplier: true, isFactory: false })).toEqual({ isSupplier: true, isFactory: false });
  });
});
