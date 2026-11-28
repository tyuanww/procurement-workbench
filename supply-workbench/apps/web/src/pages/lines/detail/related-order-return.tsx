import { createContext, useContext, useEffect, useEffectEvent, useRef, type ReactNode, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { useOneTimeDetailReturnFocus, type DetailReturnFocus } from '../../../shared/hooks/detail-return-focus.js';
import { SearchDialogFocus, useCanRestoreEntryFocus, usePreviousBrowserEntry } from '../../../shared/hooks/browser-entry-history.js';
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

export function RelatedOrderLoadError({ children }: { readonly children: ReactNode }) {
  useRestoreRelatedOrder(true);
  return children;
}

export function useRestoreRelatedOrder(isReady: boolean, sourceRegion?: RefObject<HTMLElement | null>) {
  const returnFocus = useContext(RelatedOrderReturn);
  useEffect(() => {
    if (isReady) returnFocus?.restore(sourceRegion?.current ?? returnFocus.orderRegion.current);
  }, [isReady, returnFocus, sourceRegion]);
}

export function useOrderEntryFocus<T extends HTMLElement>(focused: boolean, block: ScrollLogicalPosition) {
  const returnFocus = useContext(RelatedOrderReturn);
  const { isBlocking: isSearchBlockingFocus, returnTarget } = useContext(SearchDialogFocus);
  const navigation = useNavigationType();
  const { key, pathname } = useLocation();
  const previous = usePreviousBrowserEntry();
  const isDetailReentry = navigation === 'POP' && (previous?.pathname !== pathname || previous.key === key);
  const canRestore = useCanRestoreEntryFocus();
  const handledVisit = useRef<typeof canRestore | null>(null);
  const entry = useRef<T>(null);
  const focus = useEffectEvent(() => {
    if (returnFocus?.hasOrigin === true || entry.current === null) return;
    if (!canRestore({ allowInherited: true, searchReturnTarget: returnTarget })) return;
    entry.current.focus({ preventScroll: true });
    entry.current.scrollIntoView({ block });
  });
  useEffect(() => {
    if (!focused) {
      handledVisit.current = null;
      return;
    }
    if (isSearchBlockingFocus || handledVisit.current === canRestore) return;
    const isEntry = handledVisit.current === null || isDetailReentry;
    handledVisit.current = canRestore;
    if (isEntry) focus();
  }, [focused, isSearchBlockingFocus, canRestore, isDetailReentry]);
  return entry;
}
