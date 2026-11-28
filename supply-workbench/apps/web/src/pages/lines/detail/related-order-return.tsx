import { createContext, useContext, useEffect, useEffectEvent, useRef, type ReactNode, type RefObject } from 'react';
import { useOneTimeDetailReturnFocus, type DetailReturnFocus } from '../../../shared/hooks/detail-return-focus.js';
import { relatedFocusPrefix } from './related-procurement-navigation.js';

const RelatedOrderReturn = createContext<(DetailReturnFocus & { readonly orderRegion: RefObject<HTMLElement | null> }) | null>(null);

export function RelatedOrderReturnRegion({ isBusy, children }: { readonly isBusy: boolean; readonly children: ReactNode }) {
  const returnFocus = useOneTimeDetailReturnFocus(relatedFocusPrefix);
  const orderRegion = useRef<HTMLElement>(null);
  return <RelatedOrderReturn value={{ ...returnFocus, orderRegion }}>
    <section ref={orderRegion} tabIndex={-1} aria-label="订单详情" aria-busy={isBusy} style={{ maxWidth: 1440 }}>
      {children}
    </section>
  </RelatedOrderReturn>;
}

export function useRestoreRelatedOrder(isReady: boolean, sourceRegion: RefObject<HTMLElement | null>) {
  const returnFocus = useContext(RelatedOrderReturn);
  useEffect(() => {
    if (isReady) returnFocus?.restore(sourceRegion.current ?? returnFocus.orderRegion.current);
  }, [isReady, returnFocus, sourceRegion]);
}

export function useBatchEntryFocus(focused: boolean) {
  const returnFocus = useContext(RelatedOrderReturn);
  const row = useRef<HTMLLIElement>(null);
  const hasRelatedReturn = useEffectEvent(() => returnFocus?.hasOrigin === true);
  useEffect(() => {
    if (!focused || hasRelatedReturn() || row.current === null) return;
    const active = document.activeElement;
    if (active !== document.body && active !== row.current) return;
    row.current.focus({ preventScroll: true });
    row.current.scrollIntoView({ block: 'center' });
  }, [focused]);
  return row;
}
