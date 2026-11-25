import { can, roleLabel, type Role } from '@sw/domain';
import { SETTINGS_PATH, type NavPath, type NavRoute, type PageGate } from '../../../shared/page-manifest.js';

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

export type HomePath = '/master' | '/home' | '/reports' | typeof SETTINGS_PATH | '/today' | '/progress';

export type NavRow = {
  readonly to: NavPath;
  readonly label: string;
  readonly matchPaths: readonly string[];
  readonly badge: BadgeMark;
  readonly destinations?: NavRoute['destinations'];
};

export type AccountEntry = {
  readonly key: string;
  readonly kind: 'name' | 'role' | 'settings' | 'logout';
  readonly label: string;
};

export type ShellView = {
  readonly home: HomePath | undefined;
  readonly nav: readonly NavRow[];
  readonly procurementDate: string | null;
  readonly account: { readonly entries: readonly AccountEntry[] };
};

type Person = { readonly name: string; readonly roles: readonly Role[] };

const NO_BADGE: BadgeMark = { kind: 'none' };

export function shellView(input: {
  readonly user: Person;
  readonly queue: QueueFacts;
  readonly today: TodayFacts;
  readonly procurementDate: string | null;
  readonly navRoutes: readonly NavRoute[];
}): ShellView {
  return {
    home: homeOf({ roles: input.user.roles, queue: input.queue }),
    nav: navRows({ roles: input.user.roles, queue: input.queue, today: input.today, navRoutes: input.navRoutes }),
    procurementDate: input.procurementDate,
    account: accountOf(input.user),
  };
}

export function todayScope(input: { readonly roles: readonly Role[] }): 'mine' | 'all' {
  return hasOversight(input.roles) ? 'all' : 'mine';
}

export type RouteAccess = 'open' | 'forbidden';

export function routeAccess(input: { readonly roles: readonly Role[]; readonly gate: PageGate }): RouteAccess {
  return allows(input) ? 'open' : 'forbidden';
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
  if (input.roles.includes('manager')) return '/home';
  if (input.roles.includes('lead')) return '/reports';
  if (isSoleAdmin(input.roles)) return SETTINGS_PATH;
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
  const { to, matchPaths } = input.entry;
  const label = to === '/imports' && !can({ roles: input.roles }, 'master.review') ? '导入中心' : input.entry.label;
  const destinations = input.entry.destinations?.filter((destination) => allows({ gate: destination.gate ?? input.entry.gate, roles: input.roles }));
  return { to, label, matchPaths, badge: badgeOf(input) ?? NO_BADGE, ...(destinations === undefined || destinations.length < 2 ? {} : { destinations }) };
}

function allows(input: { readonly gate: PageGate; readonly roles: readonly Role[] }): boolean {
  if (input.gate === 'always') return true;
  if (input.gate === 'oversight') return hasOversight(input.roles);
  if (input.gate === 'imports') return can({ roles: input.roles }, 'imports.read');
  if (input.gate === 'review') return can({ roles: input.roles }, 'master.review');
  return can({ roles: input.roles }, 'admin');
}

function badgeOf(input: {
  readonly entry: NavRoute;
  readonly roles: readonly Role[];
  readonly queue: QueueFacts;
  readonly today: TodayFacts;
}): BadgeMark | undefined {
  if (input.entry.to === '/today') return todayMark(input.today);
  if (input.entry.to === '/imports') return reviewMark({ roles: input.roles, queue: input.queue });
  return undefined;
}

function accountOf(user: Person): ShellView['account'] {
  return {
    entries: [
      { key: 'name', kind: 'name', label: user.name },
      ...user.roles.map((role, index) => roleEntry({ role, index })),
      ...(can(user, 'admin') ? [{ key: 'settings', kind: 'settings', label: '系统设置' } satisfies AccountEntry] : []),
      { key: 'logout', kind: 'logout', label: '退出' },
    ],
  };
}

function roleEntry(input: { readonly role: Role; readonly index: number }): AccountEntry {
  return { key: `role-${input.index}`, kind: 'role', label: roleLabel(input.role) };
}
