import { Tooltip, type MenuProps } from 'antd';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link, matchPath } from 'react-router';
import type { NavPath, NavRow } from '../features/shell/index.js';
import type { NavDestination } from '../shared/page-manifest.js';
import { navGlyph } from '../shared/ui/nav-glyph.js';
import { space } from '../theme/tokens.js';
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
    ...(row.badgeDescription === undefined ? { title: row.badge.kind === 'count' ? `${row.badge.value} 项待办` : row.label } : {}),
    icon: <span aria-hidden="true">
      {input.isCollapsed && row.badgeDescription !== undefined
        ? <NavBadgeHint description={row.badgeDescription} style={collapsedBadgeHintStyle} />
        : null}
      {navGlyph(row.to)}
    </span>,
    label: <NavLabel row={row} isCollapsed={input.isCollapsed} />,
    children: row.destinations.map((destination) => leaf({
      to: destinationHref({ row, destination, location: input.location }),
      label: destination.label,
      key: destination.to,
      children: destination.label,
    })),
  });
}

function NavLabel({ row, isCollapsed }: { readonly row: NavRow; readonly isCollapsed: boolean }) {
  if (row.badgeDescription !== undefined) {
    if (isCollapsed) return row.label;
    return (
      <NavBadgeHint description={row.badgeDescription} style={badgeSlotStyle}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.label}</span>
        <span aria-hidden="true"><NavBadge mark={row.badge} compact={false} countProps={{ overflowCount: 999, title: false }} /></span>
      </NavBadgeHint>
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
// 折叠菜单会隐藏图标之后的 span，提示的热区放在图标之前。
const collapsedBadgeHintStyle: CSSProperties = { position: 'absolute', inset: 0, zIndex: 1 };

function NavBadgeHint({ description, style, children }: {
  readonly description: string;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const descriptionId = useId();
  const [isHovered, setHovered] = useState(false);
  const isFocused = useNavBadgeFocus({ anchor, descriptionId, dismissHover: setHovered });
  return (
    <Tooltip title={description} placement="top" trigger={['hover']} open={isHovered || isFocused} onOpenChange={setHovered}>
      <span ref={anchor} style={style}>
        {children}
        <span id={descriptionId} hidden>{description}</span>
      </span>
    </Tooltip>
  );
}

function useNavBadgeFocus({ anchor, descriptionId, dismissHover }: {
  readonly anchor: RefObject<HTMLSpanElement | null>;
  readonly descriptionId: string;
  readonly dismissHover: (open: false) => void;
}): boolean {
  const [isFocused, setFocused] = useState(false);
  useEffect(() => {
    // Ant Design owns the focusable submenu title; the badge does not add a tab stop.
    const item = anchor.current?.closest('[role="menuitem"]');
    if (item === undefined || item === null) return;
    const showOnFocus = () => { setFocused(item.matches(':focus-visible')); };
    const hideOnBlur = () => { setFocused(false); };
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissHover(false);
        hideOnBlur();
      }
    };
    item.setAttribute('aria-describedby', descriptionId);
    item.addEventListener('focus', showOnFocus);
    item.addEventListener('blur', hideOnBlur);
    item.ownerDocument.addEventListener('keydown', dismiss);
    if (item === item.ownerDocument.activeElement) showOnFocus();
    return () => {
      item.removeAttribute('aria-describedby');
      item.removeEventListener('focus', showOnFocus);
      item.removeEventListener('blur', hideOnBlur);
      item.ownerDocument.removeEventListener('keydown', dismiss);
    };
  }, [anchor, descriptionId, dismissHover]);
  return isFocused;
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
