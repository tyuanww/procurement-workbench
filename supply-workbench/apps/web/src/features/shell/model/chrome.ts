export type ViewportBand = 'wide' | 'tablet' | 'phone';

export type ViewportSnapshot = {
  readonly band: ViewportBand;
  readonly contentInset: 16 | 24;
  readonly isNarrow: boolean;
};

export const shellLayer: { readonly header: 10; readonly sider: 11 } = {
  header: 10,
  sider: 11,
};

export type SiderHold = { readonly kind: 'band-default' } | { readonly kind: 'sider'; readonly isCollapsed: boolean };

export type DrawerHold = { readonly kind: 'band-default' } | { readonly kind: 'drawer-open' };

export type ShellFrameState =
  | { readonly band: 'wide' | 'tablet'; readonly sider: SiderHold }
  | { readonly band: 'phone'; readonly drawer: DrawerHold };

export type ShellChrome =
  | {
      readonly kind: 'sider';
      readonly isCollapsed: boolean;
      readonly toggleName: '收起侧栏' | '展开侧栏';
      readonly hitPx: 40;
    }
  | {
      readonly kind: 'drawer';
      readonly isOpen: boolean;
      readonly toggleName: '打开菜单' | '关闭菜单';
      readonly hitPx: 44;
    };

export function viewportSnapshot(input: {
  readonly isMax1279: boolean;
  readonly isAtLeast768: boolean;
  readonly isMin1440: boolean;
  readonly isMax340: boolean;
}): ViewportSnapshot {
  return {
    band: bandOf(input),
    contentInset: input.isMin1440 ? 24 : 16,
    isNarrow: input.isMax340,
  };
}

export function initialFrame(snapshot: ViewportSnapshot): ShellFrameState {
  if (snapshot.band === 'phone') return { band: 'phone', drawer: { kind: 'band-default' } };
  return { band: snapshot.band, sider: { kind: 'band-default' } };
}

export function syncFrame(input: {
  readonly frame: ShellFrameState;
  readonly snapshot: ViewportSnapshot;
}): ShellFrameState {
  if (input.frame.band === input.snapshot.band) return input.frame;
  return initialFrame(input.snapshot);
}

export function shellChrome(frame: ShellFrameState): ShellChrome {
  if (frame.band === 'phone') return drawerChrome(frame.drawer);
  const isCollapsed = siderCollapsed(frame);
  return {
    kind: 'sider',
    isCollapsed,
    toggleName: isCollapsed ? '展开侧栏' : '收起侧栏',
    hitPx: siderHitPx,
  };
}

export function toggleFrame(frame: ShellFrameState): ShellFrameState {
  if (frame.band === 'phone') return toggleDrawer(frame.drawer);
  return { band: frame.band, sider: { kind: 'sider', isCollapsed: !siderCollapsed(frame) } };
}

export function closeDrawer(frame: ShellFrameState): ShellFrameState {
  if (frame.band !== 'phone') return frame;
  if (frame.drawer.kind === 'band-default') return frame;
  return { band: 'phone', drawer: { kind: 'band-default' } };
}

const siderHitPx = 40;

function bandOf(input: { readonly isMax1279: boolean; readonly isAtLeast768: boolean }): ViewportBand {
  if (!input.isAtLeast768) return 'phone';
  if (input.isMax1279) return 'tablet';
  return 'wide';
}

function siderCollapsed(frame: Extract<ShellFrameState, { readonly band: 'wide' | 'tablet' }>): boolean {
  if (frame.sider.kind === 'sider') return frame.sider.isCollapsed;
  return frame.band === 'tablet';
}

function drawerChrome(hold: DrawerHold): ShellChrome {
  const isOpen = hold.kind === 'drawer-open';
  return {
    kind: 'drawer',
    isOpen,
    toggleName: isOpen ? '关闭菜单' : '打开菜单',
    hitPx: 44,
  };
}

function toggleDrawer(hold: DrawerHold): ShellFrameState {
  if (hold.kind === 'drawer-open') return { band: 'phone', drawer: { kind: 'band-default' } };
  return { band: 'phone', drawer: { kind: 'drawer-open' } };
}
