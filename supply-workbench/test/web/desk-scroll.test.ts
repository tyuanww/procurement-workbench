import { describe, expect, it } from 'vitest';
import {
  deskNavigation,
  deskScrollPlan,
  readDeskScrollY,
  rememberDeskScroll,
} from '../../apps/web/src/pages/lines/list/desk-scroll.js';

describe('跟进台整页后退滚动', () => {
  it('页面放得下时，后退取回历史条目里的滚动位并记上这一次加载', () => {
    expect(deskScrollPlan({ navigation: 'back_forward', savedScrollY: 240, hasRestored: false, canHold: true })).toEqual({ scrollY: 240, mark: true });
    expect(deskScrollPlan({ navigation: 'back_forward', savedScrollY: 0, hasRestored: false, canHold: true })).toEqual({ scrollY: 0, mark: true });
  });

  it('页面还放不下时继续等，不把这一次恢复用掉', () => {
    expect(deskScrollPlan({ navigation: 'back_forward', savedScrollY: 1400, hasRestored: false, canHold: false })).toEqual({ scrollY: null, mark: false });
  });

  it('同文档导航不改滚动，但记下这次加载已经处理过', () => {
    expect(deskNavigation(undefined)).toBe('other');
    expect(deskNavigation('navigate')).toBe('other');
    expect(deskScrollPlan({ navigation: 'other', savedScrollY: 240, hasRestored: false, canHold: true })).toEqual({ scrollY: null, mark: true });
  });

  it('同一次文档加载不第二次写回', () => {
    expect(deskScrollPlan({ navigation: 'back_forward', savedScrollY: 840, hasRestored: true, canHold: true })).toEqual({ scrollY: null, mark: false });
  });

  it('把滚动写进当前历史条目并保留路由字段', () => {
    const next = rememberDeskScroll({ idx: 0, key: 'entry', usr: null }, 240);
    expect(next).toEqual({ idx: 0, key: 'entry', usr: null, swDeskScrollY: 240 });
    expect(readDeskScrollY(next)).toBe(240);
  });

  it('没有记下的或坏掉的历史状态不产生滚动', () => {
    expect(readDeskScrollY(null)).toBeNull();
    expect(readDeskScrollY({ idx: 0 })).toBeNull();
    expect(readDeskScrollY({ swDeskScrollY: -3 })).toBeNull();
    expect(readDeskScrollY({ swDeskScrollY: '240' })).toBeNull();
    expect(rememberDeskScroll({ idx: 1 }, Number.NaN)).toBeNull();
    expect(deskScrollPlan({ navigation: 'back_forward', savedScrollY: null, hasRestored: false, canHold: true })).toEqual({ scrollY: null, mark: true });
  });
});
