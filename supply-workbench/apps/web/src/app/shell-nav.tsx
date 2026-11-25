import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';
import { Link, matchPath } from 'react-router';
import type { NavPath, NavRow } from '../features/shell/index.js';
import type { NavDestination } from '../shared/page-manifest.js';
import { navGlyph } from '../shared/ui/nav-glyph.js';
import { NavBadge } from './shell-session.js';

export type NavLocation = { readonly pathname: string; readonly search: string };
export type NavSelection = { readonly row: NavRow; readonly destination?: NavDestination };

export function navMenuItems(input: {
  readonly rows: readonly NavRow[];
  readonly isCollapsed: boolean;
  readonly onNavigate: () => void;
  readonly navigate: (to: string) => void;
  readonly location: NavLocation;
  readonly selected: string | undefined;
}): NonNullable<MenuProps['items']> {
  const leaf = ({ to, label, key, children }: { readonly to: string; readonly label: string; readonly key: string; readonly children: ReactNode }) => ({
    key,
    label: <NavLink to={to} label={label} active={input.selected === key} onNavigate={input.onNavigate}>{children}</NavLink>,
    onClick: ({ domEvent }: Parameters<NonNullable<MenuProps['onClick']>>[0]) => {
      if (domEvent.target instanceof Element && domEvent.target.closest('a') !== null) return;
      input.navigate(to);
      input.onNavigate();
    },
  });
  return input.rows.map((row) => row.destinations === undefined ? {
    ...leaf({ to: row.to, label: row.label, key: row.to, children: <NavLabel row={row} isCollapsed={input.isCollapsed} /> }),
    icon: <span aria-hidden="true">{navGlyph(row.to)}</span>,
  } : {
    key: groupKey(row.to),
    title: row.badge.kind === 'count' ? `${row.badge.value} 项待办` : row.label,
    icon: <span aria-hidden="true">{navGlyph(row.to)}</span>,
    label: <NavLabel row={row} isCollapsed={input.isCollapsed} />,
    children: row.destinations.map((destination) => leaf({
      to: destinationHref({ row, destination, location: input.location }),
      label: destination.label,
      key: destination.to,
      children: destination.label,
    })),
  });
}

function NavLabel(input: { readonly row: NavRow; readonly isCollapsed: boolean }) {
  return (
    <span>
      {input.row.label}{' '}
      <span aria-hidden="true"><NavBadge mark={input.row.badge} compact={input.isCollapsed} /></span>
    </span>
  );
}

function NavLink(input: { readonly to: string; readonly label: string; readonly active: boolean; readonly onNavigate: () => void; readonly children: ReactNode }) {
  return <Link to={input.to} aria-label={input.label} aria-current={input.active ? 'page' : undefined}
    onClick={input.onNavigate} style={{ color: 'inherit' }}>{input.children}</Link>;
}

export function groupKey(to: NavPath): string {
  return `group:${to}`;
}

export function navigationSelection(rows: readonly NavRow[], location: NavLocation): NavSelection | undefined {
  const row = rows.flatMap((candidate) => candidate.matchPaths
    .filter((path) => matchPath({ path, end: false }, location.pathname) !== null)
    .map((path) => ({ candidate, length: path.length })))
    .sort((left, right) => right.length - left.length)[0]?.candidate;
  if (row === undefined) return undefined;
  const query = new URLSearchParams(location.search);
  const [match] = (row.destinations ?? []).flatMap((destination) => [destination.to, ...(destination.aliases ?? [])]
    .map((target) => ({ destination, score: matchDestination({ target, pathname: location.pathname, query }) }))
    .filter(({ score }) => score >= 0))
    .sort((left, right) => right.score - left.score);
  return match === undefined ? { row } : { row, destination: match.destination };
}

function matchDestination({ target, pathname, query }: { readonly target: string; readonly pathname: string; readonly query: URLSearchParams }): number {
  const [path = '', search] = target.split('?');
  if (path === '' || matchPath({ path, end: false }, pathname) === null) return -1;
  const expected = new URLSearchParams(search);
  for (const [key, value] of expected) if (query.get(key) !== value) return -1;
  return path.length + expected.size;
}

const sharedFilters: Partial<Record<NavPath, readonly string[]>> = {
  '/progress': ['store', 'scope'],
  '/dashboard': ['preset', 'from', 'to', 'lane'],
};

function destinationHref({ row, destination, location }: { readonly row: NavRow; readonly destination: NavDestination; readonly location: NavLocation }): string {
  if (!location.pathname.startsWith(row.to) || !destination.to.startsWith(row.to)) return destination.to;
  const previous = new URLSearchParams(location.search);
  const [path, search] = destination.to.split('?');
  const next = new URLSearchParams(search);
  for (const key of sharedFilters[row.to] ?? []) {
    const value = previous.get(key);
    if (value !== null) next.set(key, value);
  }
  return next.size === 0 ? destination.to : `${path}?${next}`;
}
