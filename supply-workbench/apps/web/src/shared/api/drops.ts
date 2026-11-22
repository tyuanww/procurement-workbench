export type ReadFamily = 'me' | 'today' | 'lines' | 'plan';

export type Drop = {
  readonly families: readonly ReadFamily[];
  readonly isSessionEnd: boolean;
};

const NONE: readonly ReadFamily[] = [];
const ALL: readonly ReadFamily[] = ['me', 'today', 'lines', 'plan'];
const DESK: readonly ReadFamily[] = ['today', 'lines', 'plan'];
const LINES: readonly ReadFamily[] = ['today', 'lines'];
const PLAN: readonly ReadFamily[] = ['today', 'plan'];
const TODAY: readonly ReadFamily[] = ['today'];

type Rule = {
  readonly prefix: string;
  readonly families: readonly ReadFamily[];
  readonly isExact: boolean;
};

const RULES: readonly Rule[] = [
  { prefix: '/api/v1/auth/', families: NONE, isExact: false },
  { prefix: '/api/v1/imports', families: NONE, isExact: false },
  { prefix: '/api/v1/settings', families: TODAY, isExact: true },
  { prefix: '/api/v1/reports', families: NONE, isExact: false },
  { prefix: '/api/v1/products', families: NONE, isExact: false },
  { prefix: '/api/v1/master', families: LINES, isExact: false },
  { prefix: '/api/v1/users', families: NONE, isExact: true },
  { prefix: '/api/v1/batches', families: DESK, isExact: false },
  { prefix: '/api/v1/follow-ups', families: DESK, isExact: false },
  { prefix: '/api/v1/exceptions', families: DESK, isExact: false },
  { prefix: '/api/v1/receipts', families: DESK, isExact: false },
  { prefix: '/api/v1/shipments', families: DESK, isExact: false },
  { prefix: '/api/v1/delivery-notes', families: DESK, isExact: false },
  { prefix: '/api/v1/parties', families: LINES, isExact: false },
  { prefix: '/api/v1/lines', families: DESK, isExact: false },
  { prefix: '/api/v1/plan', families: PLAN, isExact: false },
  { prefix: '/api/v1/owners', families: LINES, isExact: false },
  { prefix: '/api/v1/factory-links', families: LINES, isExact: false },
  { prefix: '/api/v1/factory-reports', families: LINES, isExact: false },
];

export function dropFor(input: {
  readonly path: string;
  readonly sessionId: string | null;
}): Drop | null {
  const special = specialDrop(input);
  if (special !== undefined) return special;
  const rule = RULES.find((item) => matches(item, input.path));
  if (rule === undefined) return null;
  return { families: rule.families, isSessionEnd: false };
}

function specialDrop(input: { readonly path: string; readonly sessionId: string | null }): Drop | undefined {
  if (input.path === '/api/v1/auth/logout') return { families: ALL, isSessionEnd: true };
  if (input.path === '/api/v1/follow-ups/latest-notes') return { families: NONE, isSessionEnd: false };
  if (input.path.startsWith('/api/v1/imports/') && input.path.includes('/commit')) {
    return { families: DESK, isSessionEnd: false };
  }
  if (input.path.startsWith('/api/v1/users/')) return userDrop(input);
  return undefined;
}

function userDrop(input: { readonly path: string; readonly sessionId: string | null }): Drop {
  const id = decodeURIComponent(input.path.slice('/api/v1/users/'.length));
  const isSelf = input.sessionId === null || id === input.sessionId;
  return { families: isSelf ? ['me'] : NONE, isSessionEnd: false };
}

function matches(rule: Rule, path: string): boolean {
  if (rule.isExact) return path === rule.prefix;
  if (path === rule.prefix || path.startsWith(`${rule.prefix}?`)) return true;
  const boundary = rule.prefix.endsWith('/') ? rule.prefix : `${rule.prefix}/`;
  return path.startsWith(boundary);
}
