import { Tooltip, type MenuProps } from 'antd';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link, matchPath, type LinkProps } from 'react-router';
import type { NavPath, NavRow } from '../features/shell/index.js';
import type { NavDestination } from '../shared/page-manifest.js';
import { navGlyph } from '../shared/ui/nav-glyph.js';
import { fontSize, space } from '../theme/tokens.js';
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
  const leaf = ({ to, label, key, children, description }: {
    readonly to: string; readonly label: string; readonly key: string; readonly children: ReactNode; readonly description?: string | undefined;
  }) => ({
    key,
    ...(to === '/today' ? { title: '' } : {}),
    label: <NavLink to={to} label={label} active={input.selected === key} onNavigate={input.onNavigate}
      isCollapsed={input.isCollapsed} description={description}>{children}</NavLink>,
    onClick: ({ domEvent }: Parameters<NonNullable<MenuProps['onClick']>>[0]) => {
      if (domEvent.target instanceof Element && domEvent.target.closest('a') !== null) return;
      input.navigate(to);
      input.onNavigate();
    },
  });
  return input.rows.map((row) => row.destinations === undefined ? {
    ...leaf({ to: row.to, label: row.label, key: row.to, description: row.todayBadge?.description,
      children: <NavLabel row={row} isCollapsed={input.isCollapsed} /> }),
    icon: navIcon(row),
  } : {
    key: groupKey(row.to),
    ...(row.todayBadge === undefined ? { title: row.badge.kind === 'count' ? `${row.badge.value} 项待办` : row.label } : {}),
    icon: navIcon(row),
    label: <NavLabel row={row} isCollapsed={input.isCollapsed} />,
    children: row.destinations.map((destination) => leaf({
      to: destinationHref({ row, destination, location: input.location }),
      label: destination.label,
      key: destination.to,
      children: destination.label,
    })),
  });
}

function navIcon(row: NavRow) {
  return <span aria-hidden="true">{navGlyph(row.to)}</span>;
}

function NavLabel({ row, isCollapsed }: { readonly row: NavRow; readonly isCollapsed: boolean }) {
  if (row.todayBadge !== undefined) {
    if (isCollapsed) return row.label;
    return (
      <span style={badgeSlotStyle}>
        <span style={{ display: 'grid', minWidth: 0, lineHeight: 1.2 }}>
          <span style={badgeTitleStyle}>{row.label}</span>
          <span aria-hidden="true" style={{ ...badgeTitleStyle, fontSize: fontSize.meta, opacity: 0.84 }}>{row.todayBadge.label}</span>
        </span>
        <span aria-hidden="true"><NavBadge mark={row.badge} compact={false} countProps={{ overflowCount: 999, title: false }} /></span>
      </span>
    );
  }
  return (
    <span>
      {row.label}{' '}
      <span aria-hidden="true"><NavBadge mark={row.badge} compact={isCollapsed} /></span>
    </span>
  );
}

const badgeSlotStyle: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) max-content', alignItems: 'center',
  gap: space[0], paddingInlineEnd: space[1],
};
const badgeTitleStyle: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis' };

function TodayNavLink({ description, isCollapsed, children, ...link }: LinkProps & {
  readonly description: string | undefined; readonly isCollapsed: boolean;
}) {
  const anchor = useRef<HTMLAnchorElement>(null);
  const id = useId();
  const descriptionId = description === undefined ? undefined : id;
  const [isHovered, setHovered] = useState(false);
  const isFocused = useNavBadgeFocus({ anchor, descriptionId, dismissHover: setHovered });
  const isOpen = isHovered || isFocused;
  let title: ReactNode = description;
  if (isCollapsed) title = description === undefined ? link['aria-label'] : <><span aria-hidden="true">{link['aria-label']} · </span>{description}</>;
  return (
    <Tooltip title={title} placement={isCollapsed ? 'right' : 'top'} trigger={['hover']} open={isOpen} onOpenChange={setHovered}>
      <Link {...link} ref={anchor} aria-describedby={isOpen ? undefined : descriptionId}
        style={isCollapsed ? { ...link.style, position: 'absolute', inset: 0 } : link.style}>
        {children}
        {descriptionId === undefined ? null : <span id={descriptionId} hidden>{description}</span>}
      </Link>
    </Tooltip>
  );
}

function useNavBadgeFocus({ anchor, descriptionId, dismissHover }: {
  readonly anchor: RefObject<HTMLAnchorElement | null>;
  readonly descriptionId: string | undefined;
  readonly dismissHover: (open: false) => void;
}): boolean {
  const [isFocused, setFocused] = useState(false);
  useEffect(() => {
    const item = anchor.current?.closest('[role="menuitem"]');
    if (item === undefined || item === null) return;
    const showOnFocus = () => { setFocused(item.ownerDocument.activeElement?.matches(':focus-visible') === true); };
    const hideOnBlur = () => { setFocused(false); };
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissHover(false);
        hideOnBlur();
      }
    };
    if (descriptionId !== undefined) item.setAttribute('aria-describedby', descriptionId);
    item.addEventListener('focusin', showOnFocus);
    item.addEventListener('focusout', hideOnBlur);
    item.ownerDocument.addEventListener('keydown', dismiss);
    if (item.contains(item.ownerDocument.activeElement)) showOnFocus();
    return () => {
      if (descriptionId !== undefined) item.removeAttribute('aria-describedby');
      item.removeEventListener('focusin', showOnFocus);
      item.removeEventListener('focusout', hideOnBlur);
      item.ownerDocument.removeEventListener('keydown', dismiss);
    };
  }, [anchor, descriptionId, dismissHover]);
  return isFocused;
}

function NavLink(input: {
  readonly to: string; readonly label: string; readonly active: boolean; readonly onNavigate: () => void; readonly children: ReactNode;
  readonly isCollapsed: boolean; readonly description: string | undefined;
}) {
  const link = { to: input.to, 'aria-label': input.label, 'aria-current': input.active ? 'page' : undefined,
    onClick: input.onNavigate, style: { color: 'inherit' }, children: input.children } satisfies LinkProps;
  if (input.to !== '/today') return <Link {...link} />;
  return <TodayNavLink {...link} description={input.description} isCollapsed={input.isCollapsed} />;
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
