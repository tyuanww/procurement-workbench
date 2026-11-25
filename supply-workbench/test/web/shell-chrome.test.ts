import { describe, expect, it } from 'vitest';
import { readDesk } from '../../apps/web/src/features/follow-up/index.js';
import { lineTitle } from '../../apps/web/src/pages/lines/detail/LineDetailPage.js';
import {
  closeDrawer,
  initialFrame,
  shellChrome,
  shellLayer,
  syncFrame,
  toggleFrame,
  type ShellChrome,
  type ViewportSnapshot,
} from '../../apps/web/src/features/shell/model/chrome.js';
import { readViewport, shellQuery, subscribeViewport, unknownViewport } from '../../apps/web/src/features/shell/use-viewport.js';
import { matchesShortcut, searchShortcutHint, type Shortcut } from '../../apps/web/src/shared/hooks/shortcuts.js';
import { antdTheme } from '../../apps/web/src/theme/antd.js';
import { contrastRatio } from '../../apps/web/src/theme/contrast.js';
import { drawerFrame, headerBarStyle, headerGridColumns, menuWidth, searchButtonStyle, searchTextStyle, siderBarStyle } from '../../apps/web/src/app/shell-frame.js';
import { freshnessChipBoxStyle, freshnessLinkStyle } from '../../apps/web/src/app/shell-session.js';
import { surfaceStyle } from '../../apps/web/src/shared/ui/page.js';
import { bg, border, brand, navCollapsed, navWidth, onBrand, radius, radiusCard, space } from '../../apps/web/src/theme/tokens.js';

const tablet: ViewportSnapshot = { band: 'tablet', contentInset: 16, isNarrow: false };
const wide: ViewportSnapshot = { band: 'wide', contentInset: 24, isNarrow: false };
const phone: ViewportSnapshot = { band: 'phone', contentInset: 16, isNarrow: false };
const searchKey: Shortcut = { key: 'k', meta: true, run: () => undefined };

it('搜索入口按系统显示可用快捷键', () => {
  expect(searchShortcutHint({ platform: 'MacIntel' })).toEqual({ label: '⌘K', ariaKeys: 'Meta+K' });
  expect(searchShortcutHint({ platform: 'Win32' })).toEqual({ label: 'Ctrl+K', ariaKeys: 'Control+K' });
  expect(searchShortcutHint({ platform: 'Win32', userAgentData: { platform: 'macOS' } }).label).toBe('⌘K');
});

describe('视口', () => {
  it('查询是 1279、768 和 1440', () => {
    expect(shellQuery).toEqual({
      max340: '(max-width: 340px)',
      max1279: '(max-width: 1279px)',
      atLeast768: '(min-width: 768px)',
      min1440: '(min-width: 1440px)',
    });
  });

  it('1279 且不低于 768 是平板，边距 16', () => {
    expect(readViewport(hostMatching([shellQuery.max1279, shellQuery.atLeast768]))).toEqual(tablet);
  });

  it('1440 且不低于 768、不命中 1279 是宽屏，边距 24', () => {
    expect(readViewport(hostMatching([shellQuery.min1440, shellQuery.atLeast768]))).toEqual(wide);
  });

  it('只命中 768 是宽屏，边距 16', () => {
    expect(readViewport(hostMatching([shellQuery.atLeast768]))).toEqual({ band: 'wide', contentInset: 16, isNarrow: false });
  });

  it('什么都不命中是手机，边距 16', () => {
    expect(readViewport(hostMatching([]))).toEqual(phone);
  });

  it('同一宽度连续读取是同一个对象', () => {
    const host = hostMatching([shellQuery.min1440, shellQuery.atLeast768]);
    expect(readViewport(host)).toBe(readViewport(host));
  });

  it('没有宿主，或 matches 不是布尔，回到未知视口', () => {
    expect(readViewport(undefined)).toEqual(unknownViewport);
    expect(readViewport({})).toEqual(unknownViewport);
    expect(readViewport({ matchMedia: () => ({ matches: 'yes' }) })).toEqual(unknownViewport);
    expect(unknownViewport).toEqual({ band: 'wide', contentInset: 16, isNarrow: false });
  });
});

describe('帧', () => {
  it('平板默认收起，宽屏默认展开，手机抽屉关闭', () => {
    expect(shellChrome(initialFrame(tablet))).toEqual(siderChrome(true, '展开侧栏'));
    expect(shellChrome(initialFrame(wide))).toEqual(siderChrome(false, '收起侧栏'));
    expect(shellChrome(initialFrame(phone))).toEqual({
      kind: 'drawer',
      isOpen: false,
      toggleName: '打开菜单',
      hitPx: 44,
    });
  });

  it('平板来回切换，换到宽屏丢掉手调，再回到平板仍是默认收起', () => {
    const opened = toggleFrame(initialFrame(tablet));
    expect(shellChrome(opened)).toEqual(siderChrome(false, '收起侧栏'));
    expect(shellChrome(toggleFrame(opened))).toEqual(siderChrome(true, '展开侧栏'));
    const widened = syncFrame({ frame: opened, snapshot: wide });
    expect(shellChrome(widened)).toEqual(siderChrome(false, '收起侧栏'));
    expect(shellChrome(syncFrame({ frame: widened, snapshot: tablet }))).toEqual(siderChrome(true, '展开侧栏'));
  });

  it('收起宽屏再进手机是关着的抽屉，回到宽屏又是展开', () => {
    const collapsed = toggleFrame(initialFrame(wide));
    const moved = syncFrame({ frame: collapsed, snapshot: phone });
    expect(shellChrome(moved)).toEqual({ kind: 'drawer', isOpen: false, toggleName: '打开菜单', hitPx: 44 });
    expect(shellChrome(syncFrame({ frame: moved, snapshot: wide }))).toEqual(siderChrome(false, '收起侧栏'));
  });

  it('关抽屉幂等，侧栏帧原样返回，同带宽换边距不换帧对象', () => {
    const sider = initialFrame(wide);
    expect(closeDrawer(sider)).toBe(sider);
    const closed = initialFrame(phone);
    expect(closeDrawer(closed)).toBe(closed);
    const opened = toggleFrame(closed);
    const once = closeDrawer(opened);
    expect(shellChrome(once).kind === 'drawer' && once !== opened).toBe(true);
    expect(closeDrawer(once)).toBe(once);
    const inset = { band: 'wide' as const, contentInset: 16 as const, isNarrow: false };
    expect(syncFrame({ frame: sider, snapshot: inset })).toBe(sider);
    expect(inset.contentInset).toBe(16);
  });
});

describe('层、圆角和菜单对比', () => {
  it('顶栏 10，侧栏 11，都低于 1000', () => {
    expect(shellLayer).toEqual({ header: 10, sider: 11 });
    expect(shellLayer.header).toBeLessThan(1000);
    expect(shellLayer.sider).toBeLessThan(1000);
  });

  it('边距等于间距阶，卡片圆角 8，控件圆角 6', () => {
    expect(space[3]).toBe(16);
    expect(space[4]).toBe(24);
    expect(radiusCard).toBe(8);
    expect(radius).toBe(6);
  });

  it('主题圆角和菜单色沿用现有令牌，对比至少 4.5', () => {
    const token = antdTheme.token;
    const menu = antdTheme.components?.Menu;
    if (token === undefined || menu === undefined) throw new Error('主题缺菜单');
    expect(token.borderRadius).toBe(6);
    expect(token.borderRadiusLG).toBe(8);
    expect(menu.darkItemSelectedBg).toBe(brand[600]);
    expect(menu.darkItemSelectedColor).toBe(onBrand.solid);
    expect(menu.darkItemColor).toBe(onBrand.muted);
    expect(menu.darkItemBg).toBe(brand[800]);
    expect(contrastRatio(onBrand.solid, brand[600])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(onBrand.muted, brand[800])).toBeGreaterThanOrEqual(4.5);
  });

  it('Ctrl 或 Meta 加 k 打开搜索，别的键不行', () => {
    expect(matchesShortcut({ key: 'k', metaKey: true, ctrlKey: false }, searchKey)).toBe(true);
    expect(matchesShortcut({ key: 'k', metaKey: false, ctrlKey: true }, searchKey)).toBe(true);
    expect(matchesShortcut({ key: 'K', metaKey: true, ctrlKey: false }, searchKey)).toBe(true);
    expect(matchesShortcut({ key: 'k', metaKey: false, ctrlKey: false }, searchKey)).toBe(false);
    expect(matchesShortcut({ key: 'p', metaKey: true, ctrlKey: false }, searchKey)).toBe(false);
  });

  it('跟进台默认每页 50，200 只作上限', () => {
    expect(readDesk('').pageSize).toBe(50);
    expect(readDesk('pageSize=200').pageSize).toBe(200);
  });

  it('订单行标题只用单号', () => {
    expect(lineTitle(null)).toBe('无单号');
    expect(lineTitle('')).toBe('无单号');
    expect(lineTitle('PO14')).toBe('PO14');
  });

  it('顶栏内边距跟内容边距，侧栏钉在视口，抽屉只给方位和宽度', () => {
    const narrow = headerBarStyle({ contentInset: 16, isPhone: false });
    const roomy = headerBarStyle({ contentInset: 24, isPhone: false });
    expect(narrow.padding).toBe('0 16px');
    expect(roomy.padding).toBe('0 24px');
    expect(narrow.position).toBe('sticky');
    expect(narrow.top).toBe(0);
    expect(narrow.zIndex).toBe(shellLayer.header);
    expect(roomy.zIndex).toBe(shellLayer.header);
    expect(narrow.gridTemplateColumns).toContain('minmax(0, 280px)');
    expect(roomy.gridTemplateColumns).toContain('minmax(0, 280px)');
    expect(searchButtonStyle().width).toBe(280);
    expect(siderBarStyle()).toMatchObject({ zIndex: shellLayer.sider, height: '100vh', alignSelf: 'flex-start' });
    expect(Object.keys(drawerFrame({ width: navWidth }))).toEqual(['placement', 'size']);
    expect(drawerFrame({ width: navWidth })).toEqual({ placement: 'left', size: navWidth });
    expect(menuWidth({ isCollapsed: true })).toBe(navCollapsed);
    expect(menuWidth({ isCollapsed: false })).toBe(navWidth);
  });

  it('手机顶栏为菜单、可缩搜索和账号，宽屏搜索固定在账号左边', () => {
    expect(headerGridColumns({ isPhone: true })).toBe('auto minmax(0, 1fr) auto');
    expect(headerGridColumns({ isPhone: false })).toBe('minmax(0, 1fr) minmax(0, 280px) auto');
    expect(headerBarStyle({ contentInset: 16, isPhone: true }).gridTemplateColumns).toBe('auto minmax(0, 1fr) auto');
    expect(searchTextStyle()).toMatchObject({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  });

  it('matchMedia 变化会通知订阅者，取消订阅后不再通知', () => {
    const listeners: (() => void)[] = [];
    const flags = { isMin1440: false };
    const media = (query: string) => ({
      matches: query === shellQuery.min1440 ? flags.isMin1440 : query === shellQuery.atLeast768,
      addEventListener: (_name: string, run: () => void) => { listeners.push(run); },
      removeEventListener: (_name: string, run: () => void) => { const index = listeners.indexOf(run); if (index >= 0) listeners.splice(index, 1); },
    });
    Object.defineProperty(globalThis, 'matchMedia', { configurable: true, writable: true, value: media });
    expect(readViewport(globalThis)).toEqual({ band: 'wide', contentInset: 16, isNarrow: false });
    let calls = 0;
    const stop = subscribeViewport(() => { calls += 1; });
    expect(listeners.length).toBe(4);
    flags.isMin1440 = true;
    for (const run of listeners) run();
    expect(calls).toBe(4);
    expect(readViewport(globalThis)).toEqual({ band: 'wide', contentInset: 24, isNarrow: false });
    stop();
    expect(listeners.length).toBe(0);
    for (const run of listeners) run();
    expect(calls).toBe(4);
  });

  it('数据更新时间能收缩并省略，完整时间仍在 Tooltip', () => {
    expect(freshnessLinkStyle()).toMatchObject({ flex: '0 1 auto', minWidth: 0, overflow: 'hidden' });
    expect(freshnessChipBoxStyle(false)).toMatchObject({ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  });

  it('卡片无阴影', () => {
    expect(surfaceStyle()).toEqual({
      background: bg.surface,
      border: `1px solid ${border}`,
      borderRadius: radiusCard,
      boxShadow: 'none',
    });
  });
});

function hostMatching(queries: readonly string[]): { matchMedia(query: string): { matches: boolean } } {
  return { matchMedia: (query) => ({ matches: queries.includes(query) }) };
}

function siderChrome(isCollapsed: boolean, toggleName: '收起侧栏' | '展开侧栏'): ShellChrome {
  return { kind: 'sider', isCollapsed, toggleName, hitPx: 40 };
}
