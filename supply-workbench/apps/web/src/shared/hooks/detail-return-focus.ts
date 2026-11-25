import { useEffect, useRef, type MouseEvent } from 'react';
import { useLocation, useNavigationType } from 'react-router';

type DetailOrigin = { readonly sourceKey: string; readonly detailPath: string };
const historyMarker = 'workbenchDetailOrigin';
const linkId = (detailPath: string) => `detail-link:${detailPath}`;

export function useDetailFocusLink(detailPath: string) {
  const { key } = useLocation();
  const origin: DetailOrigin = { sourceKey: key, detailPath };
  return {
    id: linkId(detailPath),
    state: { detailOrigin: origin },
    onClick(event: MouseEvent<HTMLAnchorElement>) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      window.history.replaceState({ ...window.history.state, [historyMarker]: origin }, '');
    },
  };
}

function readOrigin(value: unknown): DetailOrigin | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (!('sourceKey' in value) || typeof value.sourceKey !== 'string') return undefined;
  if (!('detailPath' in value) || typeof value.detailPath !== 'string') return undefined;
  return { sourceKey: value.sourceKey, detailPath: value.detailPath };
}

function linkOrigin(state: unknown) {
  return typeof state === 'object' && state !== null && 'detailOrigin' in state ? readOrigin(state.detailOrigin) : undefined;
}

export function detailReturnState(state: unknown, detailPath: string) {
  const origin = linkOrigin(state);
  return origin?.detailPath === detailPath ? { detailOrigin: origin } : undefined;
}

export function useDetailReturnFocus(isReady: boolean) {
  const { key, state } = useLocation();
  const navigation = useNavigationType();
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (!isReady || restored.current === key) return;
    const origin = navigation === 'POP' ? readOrigin(window.history.state?.[historyMarker]) : linkOrigin(state);
    if (origin === undefined || (navigation === 'POP' && origin.sourceKey !== key)) return;
    const target = document.getElementById(linkId(origin.detailPath));
    if (target === null) return;
    restored.current = key;
    if (document.activeElement === document.body) target.focus();
  }, [isReady, key, state, navigation]);
}
