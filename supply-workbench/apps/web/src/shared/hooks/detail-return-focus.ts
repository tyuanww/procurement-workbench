import { useEffect, type MouseEvent } from 'react';
import { useLocation, useNavigationType } from 'react-router';

type DetailOrigin = {
  readonly sourceKey: string;
  readonly detailPath: string;
  readonly elementId: string;
};

let pending: (DetailOrigin & { readonly pathname: string; readonly search: string }) | undefined;

export function useDetailFocusLink(detailPath: string) {
  const { key, pathname, search } = useLocation();
  const origin: DetailOrigin = { sourceKey: key, detailPath, elementId: `detail-link:${detailPath}` };
  return {
    id: origin.elementId,
    state: { detailOrigin: origin },
    onClick(event: MouseEvent<HTMLAnchorElement>) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      pending = { ...origin, pathname, search: new URLSearchParams(search).toString() };
    },
  };
}

export function detailReturnState(state: unknown, detailPath: string) {
  const origin = originOf(state);
  if (typeof origin !== 'object' || origin === null || !('detailPath' in origin) || origin.detailPath !== detailPath) return undefined;
  return { detailOrigin: origin };
}

export function useDetailReturnFocus(isReady: boolean) {
  const { key, pathname, search, state } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (!isReady || pending?.pathname !== pathname || pending.search !== new URLSearchParams(search).toString()) return;
    const isBrowserBack = navigationType === 'POP' && pending.sourceKey === key;
    if (!isBrowserBack && !sameOrigin(pending, originOf(state))) return;
    const target = document.getElementById(pending.elementId);
    pending = undefined;
    if (document.activeElement === document.body) target?.focus();
  }, [isReady, key, pathname, search, state, navigationType]);
}

function originOf(state: unknown): unknown {
  return typeof state === 'object' && state !== null && 'detailOrigin' in state ? state.detailOrigin : undefined;
}

function sameOrigin(expected: DetailOrigin, received: unknown): boolean {
  return typeof received === 'object' && received !== null
    && 'sourceKey' in received && received.sourceKey === expected.sourceKey
    && 'detailPath' in received && received.detailPath === expected.detailPath
    && 'elementId' in received && received.elementId === expected.elementId;
}
