import { Tooltip, type MenuProps } from 'antd';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link, matchPath } from 'react-router';
import { isScheduleRiskAddress } from '../features/progress/index.js';
import type { NavPath, NavRow } from '../features/shell/index.js';
import type { NavDestination } from '../shared/page-manifest.js';
import { navGlyph } from '../shared/ui/nav-glyph.js';
import { fontSize, space } from '../theme/tokens.js';
import { tabDestination, tabDestinationHref } from './navigation-destinations.js';
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
  const leaf = ({ to, label, key, children }: {
    readonly to: string; readonly label: string; readonly key: string; readonly children: ReactNode;
  }) => ({
    key,
    label: <Link to={to} aria-label={label} aria-current={input.selected === key ? 'page' : undefined}
      onClick={input.onNavigate} style={{ color: 'inherit' }}>{children}</Link>,
    onClick: ({ domEvent }: Parameters<NonNullable<MenuProps['onClick']>>[0]) => {
      if (domEvent.target instanceof Element && domEvent.target.closest('a') !== null) return;
      input.navigate(to);
      input.onNavigate();
    },
  });
  return input.rows.map((row) => {
    const { isCollapsed } = input;
    const icon = navIcon({ row, isCollapsed });
    const label = <NavLabel row={row} isCollapsed={isCollapsed} />;
    if (row.destinations === undefined) return { ...leaf({ to: row.to, label: row.label, key: row.to, children: label }), icon };
    return {
      key: groupKey(row.to),
      ...(row.todayBadge === undefined ? { title: row.badge.kind === 'count' ? `${row.badge.value} 项待办` : row.label } : {}),
      icon, label,
      children: row.destinations.map((destination) => leaf({
        to: destinationHref({ row, destination, location: input.location }),
        label: destination.label,
        key: destination.to,
        children: destination.label,
      })),
    };
  });
}

function navIcon({ row, isCollapsed }: { readonly row: NavRow; readonly isCollapsed: boolean }) {
  return <span aria-hidden="true">
    {isCollapsed && row.todayBadge !== undefined
      ? <TodayBadgeHint description={row.todayBadge.description} style={collapsedBadgeHintStyle} />
      : null}
    {navGlyph(row.to)}
  </span>;
}

function NavLabel({ row, isCollapsed }: { readonly row: NavRow; readonly isCollapsed: boolean }) {
  if (row.todayBadge !== undefined) {
    if (isCollapsed) return row.label;
    return (
      <TodayBadgeHint style={badgeSlotStyle} description={row.todayBadge.description}>
        <span style={{ display: 'grid', minWidth: 0, lineHeight: 1.2 }}>
          <span style={badgeTitleStyle}>{row.label}</span>
          <span aria-hidden="true" style={{ ...badgeTitleStyle, fontSize: fontSize.meta, opacity: 0.84 }}>{row.todayBadge.label}</span>
        </span>
        <span aria-hidden="true"><NavBadge mark={row.badge} compact={false} countProps={{ overflowCount: 999, title: false }} /></span>
      </TodayBadgeHint>
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
  gap: space[0], paddingInlineEnd: space[3],
};
const badgeTitleStyle: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis' };
const collapsedBadgeHintStyle: CSSProperties = { position: 'absolute', inset: 0, zIndex: 1 };

function TodayBadgeHint({ description, style, children }: {
  readonly description: string; readonly style: CSSProperties; readonly children?: ReactNode;
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
    item.setAttribute('aria-describedby', descriptionId);
    item.addEventListener('focusin', showOnFocus);
    item.addEventListener('focusout', hideOnBlur);
    item.ownerDocument.addEventListener('keydown', dismiss);
    if (item.contains(item.ownerDocument.activeElement)) showOnFocus();
    return () => {
      item.removeAttribute('aria-describedby');
      item.removeEventListener('focusin', showOnFocus);
      item.removeEventListener('focusout', hideOnBlur);
      item.ownerDocument.removeEventListener('keydown', dismiss);
    };
  }, [anchor, descriptionId, dismissHover]);
  return isFocused;
}

export function groupKey(to: NavPath): string {
  return `group:${to}`;
}

export function navigationSelection(rows: readonly NavRow[], location: NavLocation): NavSelection | undefined {
  if (isScheduleRiskAddress(location.pathname, location.search)) {
    const row = rows.find(({ to }) => to === '/dashboard');
    const destination = row?.destinations?.find(({ to }) => {
      const [path = '', search = ''] = to.split('?');
      return isScheduleRiskAddress(path, search);
    });
    return row === undefined || destination === undefined ? undefined : { row, destination };
  }
  const query = new URLSearchParams(location.search);
  const [match] = rows.flatMap((row) => (row.destinations ?? []).flatMap((destination) => [destination.to, ...(destination.aliases ?? [])]
    .map((target) => ({ row, destination, score: matchDestination({ target, pathname: location.pathname, query }) }))
    .filter(({ score }) => score >= 0))).sort((left, right) => right.score - left.score);
  if (match !== undefined) return { row: match.row, destination: match.destination };
  const row = rows.flatMap((candidate) => candidate.matchPaths
    .filter((path) => matchPath({ path, end: false }, location.pathname) !== null)
    .map((path) => ({ candidate, length: path.length })))
    .sort((left, right) => right.length - left.length)[0]?.candidate;
  return row === undefined ? undefined : { row };
}

export function sidebarSelection(rows: readonly NavRow[], location: NavLocation) {
  const active = navigationSelection(rows, location);
  if (active?.row.destinations === undefined) return { selected: active?.row.to, group: undefined };
  const { row } = active;
  const selected = row.to === '/today' || row.to === '/progress' ? tabDestination(row.to, location) : active.destination?.to ?? row.to;
  return { selected, group: groupKey(row.to) };
}

function matchDestination({ target, pathname, query }: { readonly target: string; readonly pathname: string; readonly query: URLSearchParams }): number {
  const [path = '', search] = target.split('?');
  if (path === '' || matchPath({ path, end: false }, pathname) === null) return -1;
  const expected = new URLSearchParams(search);
  for (const [key, value] of expected) if (query.get(key) !== value) return -1;
  return path.length + expected.size;
}

function destinationHref({ row, destination, location }: { readonly row: NavRow; readonly destination: NavDestination; readonly location: NavLocation }): string {
  const tabHref = tabDestinationHref({ group: row.to, to: destination.to, location });
  if (tabHref !== undefined) return tabHref;
  return row.to === '/dashboard' ? dashboardDestinationHref(destination.to, location) : destination.to;
}

function dashboardDestinationHref(to: string, location: NavLocation): string {
  const [path = '', search = ''] = to.split('?');
  if (!isDashboardView({ pathname: path, search }) || !isDashboardView(location)) return to;
  const previous = new URLSearchParams(location.search);
  const next = new URLSearchParams(search);
  for (const key of ['preset', 'from', 'to', 'lane']) {
    const value = previous.get(key);
    if (value !== null) next.set(key, value);
  }
  return next.size === 0 ? to : `${path}?${next}`;
}

function isDashboardView({ pathname, search }: NavLocation): boolean {
  return matchPath('/dashboard', pathname) !== null || isScheduleRiskAddress(pathname, search);
}
