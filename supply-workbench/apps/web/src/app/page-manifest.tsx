import { settingsSection, settingsSectionLabels } from '../pages/settings/settings-section.js';
import { productSection, productSectionLabels } from '../pages/products/product-section.js';
import type { ReactNode } from 'react';
import { SETTINGS_PATH, type NavPath, type NavRoute, type PageGate } from '../shared/page-manifest.js';
import { DashboardPage } from '../pages/dashboard/DashboardPage.js';
import { DirectorHomePage } from '../pages/director-home/DirectorHomePage.js';
import { ImportBatchPage } from '../pages/imports/ImportBatchPage.js';
import { ImportCenter } from '../pages/imports/ImportCenter.js';
import { LineDetailPage } from '../pages/lines/detail/LineDetailPage.js';
import { LineListPage } from '../pages/lines/list/LineListPage.js';
import { MasterPage, PartyPage } from '../pages/master/MasterPage.js';
import { ProductDetailPage, ProductListPage } from '../pages/products/ProductPages.js';
import { ProgressPage } from '../pages/progress/ProgressPage.js';
import { ReportDetailPage, ReportListPage, ReportPrintPage } from '../pages/reports/ReportPages.js';
import { SettingsPage } from '../pages/settings/SettingsPage.js';
import { TodayPage } from '../pages/today/TodayPage.js';
import { destinations } from './navigation-destinations.js';

type NavPageEntry = {
  readonly path: NavPath;
  readonly nav: { readonly label: string };
  readonly gate: PageGate;
  readonly menuParent?: never;
  readonly standalone?: never;
  readonly element: ReactNode;
};

type OtherPageEntry = {
  readonly path: string;
  readonly nav: null;
  readonly element: ReactNode;
} & (
  | { readonly gate?: PageGate; readonly menuParent?: never; readonly standalone?: never }
  | { readonly gate: PageGate; readonly menuParent: NavPath; readonly standalone?: never }
  | { readonly gate: PageGate; readonly menuParent?: never; readonly standalone: true }
);

export type PageManifestEntry = (NavPageEntry | OtherPageEntry) & {
  readonly breadcrumb?: string | ((params: URLSearchParams) => readonly string[]);
};

export const PAGE_MANIFEST: readonly PageManifestEntry[] = [
  { path: '/home', nav: { label: '首页' }, gate: 'oversight', element: <DirectorHomePage /> },
  { path: '/today', nav: { label: '今日事项' }, gate: 'always', element: <TodayPage /> },
  { path: '/progress', nav: { label: '管理店铺' }, gate: 'always', element: <ProgressPage /> },
  { path: '/progress/current', nav: null, gate: 'always', menuParent: '/progress', element: <ProgressPage view="current" /> },
  { path: '/progress/schedule', nav: null, gate: 'always', menuParent: '/progress', element: <ProgressPage view="schedule" /> },
  { path: '/progress/development', nav: null, gate: 'always', menuParent: '/progress', element: <ProgressPage view="development" /> },
  { path: '/lines', nav: { label: '跟进中心' }, gate: 'always', element: <LineListPage /> },
  { path: '/lines/:id', nav: null, breadcrumb: '订单行详情', element: <LineDetailPage /> },
  { path: '/dashboard', nav: { label: '管理看板' }, gate: 'oversight', element: <DashboardPage /> },
  { path: '/reports', nav: null, gate: 'oversight', menuParent: '/dashboard', element: <ReportListPage /> },
  { path: '/reports/:id', nav: null, breadcrumb: '周报详情', gate: 'oversight', element: <ReportDetailPage /> },
  { path: '/reports/:id/print', nav: null, gate: 'oversight', standalone: true, element: <ReportPrintPage /> },
  { path: '/parties/:id', nav: null, breadcrumb: '主体详情', element: <PartyPage /> },
  { path: '/products', nav: { label: '产品档案' }, gate: 'always', element: <ProductListPage /> },
  { path: '/products/:id', nav: null, breadcrumb: (params) => ['产品详情', productSectionLabels[productSection(params)]], element: <ProductDetailPage /> },
  { path: '/imports', nav: { label: '导入与审核' }, gate: 'imports', element: <ImportCenter /> },
  { path: '/imports/:id', nav: null, breadcrumb: '导入批次', gate: 'imports', menuParent: '/imports', element: <ImportBatchPage /> },
  { path: '/master', nav: null, gate: 'review', menuParent: '/imports', element: <MasterPage /> },
  { path: SETTINGS_PATH, nav: null, breadcrumb: (params) => ['系统设置', settingsSectionLabels[settingsSection(params).activeKey]], gate: 'admin', element: <SettingsPage /> },
];

export const NAV_ROUTES: readonly NavRoute[] = PAGE_MANIFEST.flatMap((entry) =>
  entry.nav === null ? [] : [{
    to: entry.path,
    label: entry.nav.label,
    gate: entry.gate,
    matchPaths: [entry.path, ...PAGE_MANIFEST.filter((page) => page.menuParent === entry.path).map((page) => page.path)],
    ...(destinations[entry.path] === undefined ? {} : { destinations: destinations[entry.path] }),
  }],
);
