import { can, roleLabel, type Role } from '@sw/domain';
import { freshnessView, type FreshnessChip, type FreshnessFacts } from './freshness.js';
import type { NavPath, NavRoute, PageGate } from '../../../shared/page-manifest.js';

export type { FreshnessChip, FreshnessFacts, SourceFact } from './freshness.js';

type KnownQueue = {
  readonly kind: 'known';
  readonly aliases: number;
  readonly codes: number;
  readonly links: number;
  readonly multiName: number;
};

export type QueueFacts = KnownQueue | { readonly kind: 'unknown' } | { readonly kind: 'pending' };

export type TodayFacts =
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'truncated' }
  | { readonly kind: 'complete'; readonly severities: readonly (1 | 2 | 3)[] };

export type BadgeMark =
  | { readonly kind: 'pending' }
  | { readonly kind: 'none' }
  | { readonly kind: 'count'; readonly value: number }
  | { readonly kind: 'missing' };

export type { NavPath } from '../../../shared/page-manifest.js';

export type HomePath = '/master' | '/dashboard' | '/reports' | '/settings' | '/today' | '/progress';

export type NavRow = {
  readonly to: NavPath;
  readonly label: string;
  readonly badge: BadgeMark;
};

export type AccountEntry = {
  readonly key: string;
  readonly kind: 'name' | 'role' | 'logout';
  readonly label: string;
};

export type ShellView = {
  readonly home: HomePath | undefined;
  readonly nav: readonly NavRow[];
  readonly freshness: { readonly headline: string; readonly chips: readonly FreshnessChip[] };
  readonly account: { readonly entries: readonly AccountEntry[] };
};

type Person = { readonly name: string; readonly roles: readonly Role[] };

const NO_BADGE: BadgeMark = { kind: 'none' };

export function shellView(input: {
  readonly user: Person;
  readonly queue: QueueFacts;
  readonly today: TodayFacts;
  readonly freshness: FreshnessFacts;
  readonly now: string;
  readonly navRoutes: readonly NavRoute[];
}): ShellView {
  return {
    home: homeOf({ roles: input.user.roles, queue: input.queue }),
    nav: navRows({ roles: input.user.roles, queue: input.queue, today: input.today, navRoutes: input.navRoutes }),
    freshness: freshnessView({ facts: input.freshness, now: input.now }),
    account: accountOf(input.user),
  };
}

export function todayScope(input: { readonly roles: readonly Role[] }): 'mine' | 'all' {
  return hasOversight(input.roles) ? 'all' : 'mine';
}

export type RouteAccess = 'open' | 'forbidden';

export function routeAccess(input: { readonly roles: readonly Role[]; readonly pathname: string; readonly navRoutes: readonly NavRoute[] }): RouteAccess {
  const entry = input.navRoutes.find((item) => matchesPath(item.to, input.pathname));
  if (entry === undefined) return 'open';
  if (allows({ gate: entry.gate, roles: input.roles })) return 'open';
  return 'forbidden';
}

function hasOversight(roles: readonly Role[]): boolean {
  return roles.includes('manager') || roles.includes('lead') || roles.includes('admin');
}

function homeOf(input: {
  readonly roles: readonly Role[];
  readonly queue: QueueFacts;
}): HomePath | undefined {
  if (input.queue.kind === 'pending') return undefined;
  if (input.roles.includes('reviewer') && hasReviewWork(input.queue)) return '/master';
  if (input.roles.includes('manager')) return '/dashboard';
  if (input.roles.includes('lead')) return '/reports';
  if (isSoleAdmin(input.roles)) return '/settings';
  if (input.roles.length === 1 && input.roles[0] === 'buyer') return '/today';
  return '/progress';
}

function isSoleAdmin(roles: readonly Role[]): boolean {
  return roles.includes('admin') && roles.length === 1;
}

function hasReviewWork(queue: QueueFacts): boolean {
  if (queue.kind !== 'known') return false;
  return queueSum(queue) > 0;
}

function queueSum(queue: KnownQueue): number {
  return queue.aliases + queue.codes + queue.links + queue.multiName;
}

function reviewMark(input: {
  readonly roles: readonly Role[];
  readonly queue: QueueFacts;
}): BadgeMark {
  if (!input.roles.includes('reviewer')) return NO_BADGE;
  if (input.queue.kind === 'pending') return { kind: 'pending' };
  if (input.queue.kind === 'unknown') return { kind: 'missing' };
  const total = queueSum(input.queue);
  if (total > 0) return { kind: 'count', value: total };
  return NO_BADGE;
}

function todayMark(today: TodayFacts): BadgeMark {
  if (today.kind === 'pending') return { kind: 'pending' };
  if (today.kind === 'failed' || today.kind === 'truncated') return { kind: 'missing' };
  const urgent = today.severities.filter((severity) => severity >= 2).length;
  if (urgent > 0) return { kind: 'count', value: urgent };
  return NO_BADGE;
}


function navRows(input: {
  readonly roles: readonly Role[];
  readonly queue: QueueFacts;
  readonly today: TodayFacts;
  readonly navRoutes: readonly NavRoute[];
}): NavRow[] {
  return input.navRoutes.filter((entry) => allows({ gate: entry.gate, roles: input.roles })).map((entry) => navRow({
    entry,
    roles: input.roles,
    queue: input.queue,
    today: input.today,
  }));
}

function navRow(input: {
  readonly entry: NavRoute;
  readonly roles: readonly Role[];
  readonly queue: QueueFacts;
  readonly today: TodayFacts;
}): NavRow {
  const badge = badgeOf(input);
  if (badge === undefined) return row({ to: input.entry.to, label: input.entry.label });
  return row({ to: input.entry.to, label: input.entry.label, badge });
}

function allows(input: { readonly gate: PageGate; readonly roles: readonly Role[] }): boolean {
  if (input.gate === 'always') return true;
  if (input.gate === 'oversight') return hasOversight(input.roles);
  if (input.gate === 'review') return can({ roles: input.roles }, 'master.review');
  return can({ roles: input.roles }, 'admin');
}

function matchesPath(to: string, pathname: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function badgeOf(input: {
  readonly entry: NavRoute;
  readonly roles: readonly Role[];
  readonly queue: QueueFacts;
  readonly today: TodayFacts;
}): BadgeMark | undefined {
  if (input.entry.to === '/today') return todayMark(input.today);
  if (input.entry.to === '/master') return reviewMark({ roles: input.roles, queue: input.queue });
  return undefined;
}

function row(input: {
  readonly to: NavPath;
  readonly label: string;
  readonly badge?: BadgeMark;
}): NavRow {
  return { to: input.to, label: input.label, badge: input.badge ?? NO_BADGE };
}

function accountOf(user: Person): ShellView['account'] {
  return {
    entries: [
      { key: 'name', kind: 'name', label: user.name },
      ...user.roles.map((role, index) => roleEntry({ role, index })),
      { key: 'logout', kind: 'logout', label: '退出' },
    ],
  };
}

function roleEntry(input: { readonly role: Role; readonly index: number }): AccountEntry {
  return { key: `role-${input.index}`, kind: 'role', label: roleLabel(input.role) };
}
