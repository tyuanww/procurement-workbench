import { can } from '@sw/application';
import { CAPABILITY_MANIFEST, type CapabilityId, type PermissionAction, type Role } from '@sw/contracts';

export type ReadAccess =
  | { readonly kind: 'public' }
  | { readonly kind: 'permission'; readonly action: PermissionAction }
  | { readonly kind: 'unknown' };

export type ReadAccessRule = {
  readonly prefix: string;
  readonly access:
    | { readonly kind: 'public' }
    | { readonly kind: 'permission'; readonly capability: CapabilityId; readonly action: PermissionAction };
};

type DraftRule = {
  readonly prefix: string;
  readonly access:
    | { readonly kind: 'public' }
    | { readonly kind: 'capability'; readonly capability: CapabilityId; readonly action?: PermissionAction };
};

const CAPABILITIES = new Map(CAPABILITY_MANIFEST.map((entry) => [entry.id, entry]));

const DRAFT_RULES: readonly DraftRule[] = [
  { prefix: '/api/v1/health', access: { kind: 'public' } },
  { prefix: '/api/v1/meta/auth', access: { kind: 'public' } },
  { prefix: '/api/v1/auth', access: { kind: 'public' } },
  { prefix: '/api/v1/me', access: { kind: 'capability', capability: 'platform', action: 'session.read' } },
  { prefix: '/api/v1/meta/session', access: { kind: 'capability', capability: 'platform', action: 'session.read' } },
  { prefix: '/api/v1/meta/freshness', access: { kind: 'capability', capability: 'platform', action: 'data.read' } },
  { prefix: '/api/v1/settings', access: { kind: 'capability', capability: 'platform', action: 'data.read' } },
  { prefix: '/api/v1/users', access: { kind: 'capability', capability: 'platform', action: 'admin' } },
  { prefix: '/api/v1/audit', access: { kind: 'capability', capability: 'platform', action: 'admin' } },
  { prefix: '/api/v1/imports', access: { kind: 'capability', capability: 'imports' } },
  { prefix: '/api/v1/templates', access: { kind: 'capability', capability: 'imports' } },
  { prefix: '/api/v1/lines', access: { kind: 'capability', capability: 'follow-up' } },
  { prefix: '/api/v1/batches', access: { kind: 'capability', capability: 'follow-up' } },
  { prefix: '/api/v1/exceptions', access: { kind: 'capability', capability: 'follow-up' } },
  { prefix: '/api/v1/follow-ups', access: { kind: 'capability', capability: 'follow-up' } },
  { prefix: '/api/v1/delivery-notes', access: { kind: 'capability', capability: 'follow-up' } },
  { prefix: '/api/v1/receipts', access: { kind: 'capability', capability: 'follow-up' } },
  { prefix: '/api/v1/shipments', access: { kind: 'capability', capability: 'follow-up' } },
  { prefix: '/api/v1/factory-reports', access: { kind: 'capability', capability: 'follow-up' } },
  { prefix: '/api/v1/today', access: { kind: 'capability', capability: 'today' } },
  { prefix: '/api/v1/master', access: { kind: 'capability', capability: 'master-data', action: 'master.read' } },
  { prefix: '/api/v1/parties', access: { kind: 'capability', capability: 'master-data', action: 'data.read' } },
  { prefix: '/api/v1/items', access: { kind: 'capability', capability: 'master-data', action: 'data.read' } },
  { prefix: '/api/v1/dashboard/management-meeting', access: { kind: 'capability', capability: 'reporting', action: 'dashboard.read' } },
  { prefix: '/api/v1/dashboard', access: { kind: 'capability', capability: 'performance' } },
  { prefix: '/api/v1/reports', access: { kind: 'capability', capability: 'reporting', action: 'reports.read' } },
  { prefix: '/api/v1/products', access: { kind: 'capability', capability: 'product-archive' } },
  { prefix: '/api/v1/search', access: { kind: 'capability', capability: 'search' } },
  { prefix: '/api/v1/owners', access: { kind: 'capability', capability: 'owner' } },
  { prefix: '/api/v1/factory-links', access: { kind: 'capability', capability: 'factory-links' } },
  { prefix: '/api/v1/product-development', access: { kind: 'capability', capability: 'product-development' } },
  { prefix: '/api/v1/plan', access: { kind: 'capability', capability: 'plan' } },
];

export const READ_ACCESS_RULES: readonly ReadAccessRule[] = DRAFT_RULES.map((rule) => ({
  prefix: rule.prefix,
  access:
    rule.access.kind === 'public'
      ? { kind: 'public' }
      : { kind: 'permission', capability: rule.access.capability, action: resolveAction(rule.access.capability, rule.access.action) },
}));

export function readAccessOf(apiPath: string): ReadAccess {
  const rule = READ_ACCESS_RULES.find((item) => matches(item.prefix, apiPath));
  if (rule === undefined) return { kind: 'unknown' };
  return rule.access.kind === 'public' ? { kind: 'public' } : { kind: 'permission', action: rule.access.action };
}

export function canRead(actor: { readonly roles: readonly Role[] }, apiPath: string): boolean {
  const access = readAccessOf(apiPath);
  if (access.kind === 'public') return true;
  if (access.kind === 'permission') return can(actor, access.action);
  return false;
}

export function uncoveredRoutes(routes: readonly string[]): readonly string[] {
  return routes.filter((route) => readAccessOf(route).kind === 'unknown');
}

function matches(prefix: string, apiPath: string): boolean {
  return apiPath === prefix || apiPath.startsWith(`${prefix}/`) || apiPath.startsWith(`${prefix}?`);
}

function resolveAction(capability: CapabilityId, action: PermissionAction | undefined): PermissionAction {
  const entry = CAPABILITIES.get(capability);
  if (entry === undefined) throw new Error(`未知能力 ${capability}`);
  if (action !== undefined) {
    if (!entry.readPermissions.includes(action)) throw new Error(`能力 ${capability} 没有读权限 ${action}`);
    return action;
  }
  const only = entry.readPermissions[0];
  if (entry.readPermissions.length !== 1 || only === undefined) throw new Error(`能力 ${capability} 有多个读权限，路由规则必须写明 action`);
  return only;
}
