import type { PermissionAction } from '@sw/domain';

/**
 * 应用能力清单：新增一个能力时只改这份清单和 packages/application/src/<id> 目录。
 *
 * 约束由 test/architecture/capability-manifest.test.ts 守住：
 * - id 与 packages/application/src 的能力目录一致；
 * - webFeature 为 null 表示没有独立前端 feature，界面寄生在别的 feature 里；
 *   非 null 时必须存在于 apps/web/src/features；
 * - navLabel 为 null 表示没有自己的顶层导航；非 null 时必须来自壳层导航且不重复；
 * - routePrefixes 是能力在 /api/v1 下占用的 URL 根，允许两个能力共享同一个根；
 * - dependsOn 只记录通过对方 index.ts 的公开依赖；
 * - 这里只放类型和常量，不放路由、组件、数据库和校验器。
 */

export const WEB_FEATURE_IDS = [
  'follow-up',
  'imports',
  'master-data',
  'performance',
  'plan',
  'platform',
  'product-archive',
  'progress',
  'reporting',
  'search',
  'shell',
  'today',
] as const;

export type WebFeatureId = (typeof WEB_FEATURE_IDS)[number];

export const CAPABILITY_IDS = [
  'platform',
  'imports',
  'follow-up',
  'today',
  'master-data',
  'performance',
  'reporting',
  'product-archive',
  'search',
  'owner',
  'factory-links',
  'plan',
  'product-development',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

/**
 * readPermissions 按现有 read-access 路由矩阵归集；writePermissions 按能力内写用例的
 * authorize 归集。路由级细分留给 X09，这里只表达能力当前的权限动作集合。
 */
export type CapabilityManifestEntry = {
  readonly id: CapabilityId;
  readonly readPermissions: readonly PermissionAction[];
  readonly writePermissions: readonly PermissionAction[];
  readonly routePrefixes: readonly string[];
  readonly webFeature: WebFeatureId | null;
  readonly navLabel: string | null;
  readonly dependsOn: readonly CapabilityId[];
};

export const CAPABILITY_MANIFEST: readonly CapabilityManifestEntry[] = [
  {
    id: 'platform',
    readPermissions: ['session.read', 'data.read', 'admin'],
    writePermissions: ['admin'],
    routePrefixes: ['/api/v1/me', '/api/v1/meta', '/api/v1/settings', '/api/v1/users', '/api/v1/audit', '/api/v1/health'],
    webFeature: 'platform',
    navLabel: null,
    dependsOn: [],
  },
  {
    id: 'imports',
    readPermissions: ['imports.read'],
    writePermissions: ['imports.write'],
    routePrefixes: ['/api/v1/imports', '/api/v1/templates'],
    webFeature: 'imports',
    navLabel: '导入与审核',
    dependsOn: [],
  },
  {
    id: 'follow-up',
    readPermissions: ['data.read'],
    writePermissions: ['lines.write', 'records.write'],
    routePrefixes: [
      '/api/v1/lines',
      '/api/v1/batches',
      '/api/v1/exceptions',
      '/api/v1/follow-ups',
      '/api/v1/delivery-notes',
      '/api/v1/receipts',
      '/api/v1/shipments',
      '/api/v1/factory-reports',
    ],
    webFeature: 'follow-up',
    navLabel: '跟进中心',
    dependsOn: ['master-data'],
  },
  {
    id: 'today',
    readPermissions: ['today.read'],
    writePermissions: [],
    routePrefixes: ['/api/v1/today'],
    webFeature: 'today',
    navLabel: '今日事项',
    dependsOn: [],
  },
  {
    id: 'master-data',
    readPermissions: ['master.read', 'data.read'],
    writePermissions: ['master.review'],
    routePrefixes: ['/api/v1/master', '/api/v1/parties', '/api/v1/items', '/api/v1/factory-reports'],
    webFeature: 'master-data',
    navLabel: null,
    dependsOn: [],
  },
  {
    id: 'performance',
    readPermissions: ['dashboard.read'],
    writePermissions: [],
    routePrefixes: ['/api/v1/dashboard'],
    webFeature: 'performance',
    navLabel: '管理看板',
    dependsOn: ['master-data'],
  },
  {
    id: 'reporting',
    readPermissions: ['reports.read', 'dashboard.read'],
    writePermissions: ['reports.generate', 'reports.export'],
    routePrefixes: ['/api/v1/reports', '/api/v1/dashboard/management-meeting', '/api/v1/dashboard/director'],
    webFeature: 'reporting',
    navLabel: null,
    dependsOn: ['platform', 'performance'],
  },
  {
    id: 'product-archive',
    readPermissions: ['products.read'],
    writePermissions: ['products.maintain'],
    routePrefixes: ['/api/v1/products'],
    webFeature: 'product-archive',
    navLabel: '产品档案',
    dependsOn: ['follow-up', 'master-data'],
  },
  {
    id: 'search',
    readPermissions: ['search.read'],
    writePermissions: [],
    routePrefixes: ['/api/v1/search'],
    webFeature: 'search',
    navLabel: null,
    dependsOn: [],
  },
  {
    id: 'owner',
    readPermissions: ['data.read'],
    writePermissions: ['lines.write'],
    routePrefixes: ['/api/v1/owners'],
    webFeature: null,
    navLabel: null,
    dependsOn: [],
  },
  {
    id: 'factory-links',
    readPermissions: ['data.read'],
    writePermissions: ['master.review'],
    routePrefixes: ['/api/v1/factory-links', '/api/v1/lines'],
    webFeature: null,
    navLabel: null,
    dependsOn: [],
  },
  {
    id: 'plan',
    readPermissions: ['plan.read'],
    writePermissions: ['records.write'],
    routePrefixes: ['/api/v1/plan'],
    webFeature: 'plan',
    navLabel: null,
    dependsOn: [],
  },
  {
    id: 'product-development',
    readPermissions: ['plan.read'],
    writePermissions: ['products.maintain', 'records.write'],
    routePrefixes: ['/api/v1/product-development'],
    webFeature: null,
    navLabel: null,
    dependsOn: ['plan'],
  },
];
