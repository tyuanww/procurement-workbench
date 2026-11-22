import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { PartyAliasView } from '../../packages/application/src/master-data/views.js';
import { drawerWidth, drawerWide } from '../../apps/web/src/theme/tokens.js';
import { readPartyAliasDrawer, writePartyAliasDrawer } from '../../apps/web/src/pages/master/party-alias-drawer-url.js';
import { AliasReviewFields } from '../../apps/web/src/pages/master/AliasReviewDrawer.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

const alias: PartyAliasView = {
  id: 'alias-1',
  rawName: '宜侬',
  normName: '宜侬',
  partyId: null,
  status: 'pending',
  firstSeenImportBatchId: 'batch-1',
  seenCount: 241,
  reviewedBy: null,
  reviewedAt: null,
  similar: [{ partyId: 'party-1', displayName: '宜侬供应链' }],
};

describe('主体别名 720 抽屉', () => {
  it('打开和关闭只改抽屉参数，保留已有标签页', () => {
    const opened = writePartyAliasDrawer({ search: '?tab=aliases', aliasId: alias.id, isOpen: true });
    expect(opened.toString()).toBe('tab=aliases&drawer=alias&aliasId=alias-1');

    const closed = writePartyAliasDrawer({ search: `${opened.toString()}`, aliasId: alias.id, isOpen: false });
    expect(closed.toString()).toBe('tab=aliases');
    expect(readPartyAliasDrawer('?drawer=alias&aliasId=alias-1')).toBe('alias-1');
    expect(readPartyAliasDrawer('?drawer=alias')).toBeNull();
    expect(readPartyAliasDrawer('?drawer=edit&aliasId=alias-1')).toBeNull();
  });

  it('别名审核使用 720，现有快捷抽屉仍是 480', () => {
    expect(drawerWide).toBe(720);
    expect(drawerWidth).toBe(480);
  });

  it('抽屉显示原文、已有主体、新建角色和二次确认入口', () => {
    const html = markup(AliasReviewFields, {
      alias,
      open: true,
      partyId: '',
      roles: { isSupplier: true, isFactory: false },
      confirmed: false,
      isSubmitting: false,
      error: '',
      onParty: () => undefined,
      onRoles: () => undefined,
      onConfirm: () => undefined,
      onSubmit: () => undefined,
      onClose: () => undefined,
    });
    expect(html).toContain('宜侬');
    expect(html).toContain('关联到已有主体');
    expect(html).toContain('新建');
    expect(html).toContain('供应商');
    expect(html).toContain('代工厂');

    const existing = markup(AliasReviewFields, { alias, open: true, partyId: 'party-1', roles: { isSupplier: true, isFactory: false }, confirmed: false, isSubmitting: false, error: '', onParty: () => undefined, onRoles: () => undefined, onConfirm: () => undefined, onSubmit: () => undefined, onClose: () => undefined });
    expect(existing).toContain('宜侬供应链');
  });
});

function markup(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(type, props));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
