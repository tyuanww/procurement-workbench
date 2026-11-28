import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useDetailFocusLink, useDetailReturnFocus } from '../../shared/hooks/detail-return-focus.js';

type ProductOrigin = { address: string; state: object | null; target: string; tabLabel: string };
const ProductRestore = createContext<((target: string, link: HTMLAnchorElement | null) => void) | null>(null);

export function ProductJourney({ children }: { readonly children: ReactNode }) {
  const { key, state } = useLocation();
  const handled = useRef<string | null>(null);
  const restore = useCallback((target: string, link: HTMLAnchorElement | null) => {
    if (link === null || handled.current === key || state?.restoreProductLink !== target) return;
    handled.current = key;
    link.focus();
  }, [key, state]);
  return <ProductRestore value={restore}>{children}</ProductRestore>;
}

export function productNavigationState(state: unknown): unknown {
  if (typeof state !== 'object' || state === null || !('restoreProductLink' in state)) return state;
  const navigation = { ...state };
  delete navigation.restoreProductLink;
  return navigation;
}

export function ProductDrillLink({ to, tabLabel, sourceLink = to, isFocusReady, children }: {
  to: string; tabLabel: string; sourceLink?: string; isFocusReady?: boolean; children: ReactNode;
}) {
  const here = useLocation();
  const focus = useDetailFocusLink(to, sourceLink);
  const link = useRef<HTMLAnchorElement>(null);
  const restore = useContext(ProductRestore);
  useDetailReturnFocus(isFocusReady ?? true, { allowContainerFocus: isFocusReady !== undefined });
  useEffect(() => { if (isFocusReady !== false) restore?.(sourceLink, link.current); }, [isFocusReady, restore, sourceLink]);
  const origin: ProductOrigin = { address: here.pathname + here.search, state: here.state, target: sourceLink, tabLabel };
  return <Link {...focus} ref={link} to={to} state={{ ...focus.state, productOrigin: origin }}>{children}</Link>;
}

export function ProductOriginReturn({ children }: { children: ReactNode }) {
  const { state } = useLocation();
  const origin: ProductOrigin | undefined = state?.productOrigin;
  if (!origin || !/^\/products\/[^/?#]+(?:\?|$)/.test(origin.address)) return children;
  return <><p><Link to={origin.address} state={{ ...origin.state, restoreProductLink: origin.target }}>
    返回产品{origin.tabLabel}</Link></p>{children}</>;
}
