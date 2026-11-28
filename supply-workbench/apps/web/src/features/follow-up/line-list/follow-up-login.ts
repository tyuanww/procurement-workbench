import { matchPath } from 'react-router';
import { FOLLOW_UP_FRAGMENT } from './follow-up-address.js';

const LOGIN_FRAGMENT = '#follow-up-login=';
const storagePrefix = 'workbench.follow-up.login:';
const isLinePath = (pathname: string) => matchPath('/lines', pathname) !== null || matchPath('/lines/:id', pathname) !== null;

export function followUpFeishuReturn(returnTo: string, token: string) {
  const { pathname, search, hash } = new URL(returnTo, 'https://workbench.invalid');
  if (!isLinePath(pathname) || !hash.startsWith(FOLLOW_UP_FRAGMENT)) return { returnTo };
  const target = pathname + search;
  return { returnTo: target + LOGIN_FRAGMENT + token, stored: { key: storagePrefix + token, value: target + hash } };
}

export function followUpLoginResume({ pathname, search, hash }: { readonly pathname: string; readonly search: string; readonly hash: string }) {
  if (!isLinePath(pathname) || !hash.startsWith(LOGIN_FRAGMENT)) return null;
  const token = hash.slice(LOGIN_FRAGMENT.length);
  if (!/^[a-f0-9-]{36}$/u.test(token)) return null;
  const storageKey = storagePrefix + token;
  const target = pathname + search;
  try {
    const saved = window.sessionStorage.getItem(storageKey);
    return { storageKey, to: saved?.startsWith(target + FOLLOW_UP_FRAGMENT) === true ? saved : null };
  } catch {
    return { storageKey, to: null };
  }
}
