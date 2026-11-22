import { describe, expect, it } from 'vitest';
import { readProductEdit, writeProductEdit } from '../../apps/web/src/pages/products/product-edit-url.js';
import { drawerWide } from '../../apps/web/src/theme/tokens.js';

describe('产品编辑抽屉的 URL 状态', () => {
  it('打开只加 drawer=edit，card、scope、stage 都保留', () => {
    const next = writeProductEdit({ search: '?card=purchases&scope=exact&stage=confirmed', isOpen: true });
    expect(next.toString()).toBe('card=purchases&scope=exact&stage=confirmed&drawer=edit');
  });

  it('关闭只删 drawer，card、scope、stage 不动', () => {
    const next = writeProductEdit({ search: '?card=purchases&scope=exact&stage=confirmed&drawer=edit', isOpen: false });
    expect(next.toString()).toBe('card=purchases&scope=exact&stage=confirmed');
    expect(next.has('drawer')).toBe(false);
  });

  it('打开时没有其他参数也能得到 drawer=edit，不重复写', () => {
    expect(writeProductEdit({ search: '', isOpen: true }).toString()).toBe('drawer=edit');
    expect(writeProductEdit({ search: 'drawer=edit', isOpen: true }).toString()).toBe('drawer=edit');
  });

  it('readProductEdit 只认 edit，其他值和非法值都返回 false', () => {
    expect(readProductEdit('?drawer=edit')).toBe(true);
    expect(readProductEdit('drawer=edit')).toBe(true);
    expect(readProductEdit('?drawer=ship')).toBe(false);
    expect(readProductEdit('?drawer=EDIT')).toBe(false);
    expect(readProductEdit('?drawer=')).toBe(false);
    expect(readProductEdit('?card=purchases&scope=exact')).toBe(false);
    expect(readProductEdit('')).toBe(false);
  });

  it('编辑抽屉宽度用 720 的 token，480 不动', () => {
    expect(drawerWide).toBe(720);
  });
});
