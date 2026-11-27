import { useEffect, useRef, type MouseEvent } from 'react';
import { useLocation, useNavigationType } from 'react-router';

type DetailOrigin = { readonly sourceKey: string; readonly detailPath: string; readonly sourceLink?: string };
const historyMarker = 'workbenchDetailOrigin';
const linkId = (detailPath: string) => `detail-link:${detailPath}`;

export function useDetailFocusLink(detailPath: string, sourceLink = detailPath) {
  const { key } = useLocation();
  const origin: DetailOrigin = { sourceKey: key, detailPath, ...(sourceLink === detailPath ? {} : { sourceLink }) };
  return {
    id: linkId(sourceLink),
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
  const sourceLink = 'sourceLink' in value && typeof value.sourceLink === 'string' ? value.sourceLink : undefined;
  return { sourceKey: value.sourceKey, detailPath: value.detailPath, ...(sourceLink === undefined ? {} : { sourceLink }) };
}

function linkOrigin(state: unknown) {
  return typeof state === 'object' && state !== null && 'detailOrigin' in state ? readOrigin(state.detailOrigin) : undefined;
}

function historyOrigin(key: string) {
  const origin = readOrigin(window.history.state?.[historyMarker]);
  return origin?.sourceKey === key ? origin : undefined;
}

export function detailReturnState(state: unknown, detailPath: string) {
  const origin = linkOrigin(state);
  return origin?.detailPath === detailPath ? { detailOrigin: origin } : undefined;
}

export function useDetailReturnFocus(isReady: boolean, { allowContainerFocus = false } = {}) {
  const { key, state } = useLocation();
  const navigation = useNavigationType();
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (!isReady || restored.current === key) return;
    const origin = navigation === 'POP' ? historyOrigin(key) : linkOrigin(state);
    if (origin === undefined) return;
    const target = document.getElementById(linkId(origin.sourceLink ?? origin.detailPath));
    if (target === null) return;
    restored.current = key;
    if (canRestoreFocus(target, allowContainerFocus)) target.focus();
  }, [allowContainerFocus, isReady, key, state, navigation]);
}

function canRestoreFocus(target: HTMLElement, allowContainerFocus: boolean): boolean {
  const focused = document.activeElement;
  return focused === document.body || (allowContainerFocus && focused?.contains(target) === true);
}
