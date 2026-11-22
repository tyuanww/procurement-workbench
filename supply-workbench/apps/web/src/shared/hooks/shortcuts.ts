export type Shortcut = {
  readonly key: string;
  readonly meta: boolean;
  readonly run: () => void;
};

export function matchesShortcut(event: { readonly key: string; readonly metaKey: boolean; readonly ctrlKey: boolean }, shortcut: Shortcut): boolean {
  const isPressed = event.metaKey || event.ctrlKey;
  return event.key.toLowerCase() === shortcut.key.toLowerCase() && isPressed === shortcut.meta;
}

export function searchShortcut(run: () => void): Shortcut {
  return { key: 'k', meta: true, run };
}

type ShortcutPlatform = {
  readonly platform: string;
  readonly userAgentData?: { readonly platform: string };
};

export function searchShortcutHint(browser: ShortcutPlatform = globalThis.navigator): {
  readonly label: string;
  readonly ariaKeys: string;
} {
  const platform = browser?.userAgentData?.platform || browser?.platform || '';
  return /^(mac|iphone|ipad|ipod)/i.test(platform)
    ? { label: '⌘K', ariaKeys: 'Meta+K' }
    : { label: 'Ctrl+K', ariaKeys: 'Control+K' };
}
