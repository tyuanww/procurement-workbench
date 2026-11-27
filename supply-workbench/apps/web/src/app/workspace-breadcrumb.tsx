import { Breadcrumb } from 'antd';
import { matchPath, useLocation } from 'react-router';
import { routeAccess, type NavRow } from '../features/shell/index.js';
import { useActorRoles, useCan } from '../shared/actor.js';
import { isScheduleRiskAddress } from '../features/progress/index.js';
import { space } from '../theme/tokens.js';
import { PAGE_MANIFEST, type PageManifestEntry } from './page-manifest.js';
import { navigationSelection, type NavSelection } from './shell-nav.js';

export function WorkspaceBreadcrumb({ rows, inline = false }: { readonly rows: readonly NavRow[]; readonly inline?: boolean }) {
  const location = useLocation();
  const roles = useActorRoles();
  const canSeeRisk = useCan('dashboard.read');
  const page = PAGE_MANIFEST.find(({ path }) => matchPath(path, location.pathname) !== null);
  if (page === undefined || routeAccess({ roles, gate: page.gate ?? 'always' }) !== 'open') return null;
  if (!canSeeRisk && isScheduleRiskAddress(page.path, location.search)) return null;
  const trail = breadcrumbTrail({ page, active: navigationSelection(rows, location), search: location.search });
  if (trail.length === 0) return null;
  const items = trail.map((label, index) => ({
    title: index === trail.length - 1 ? <span aria-current="page">{label}</span> : label,
  }));
  return <Breadcrumb aria-label="当前位置" items={items} style={inline
    ? { minWidth: 0, lineHeight: '20px' }
    : { marginBottom: space[3] }} />;
}

function breadcrumbTrail({ page, active, search }: { readonly page: PageManifestEntry; readonly active: NavSelection | undefined; readonly search: string }): readonly string[] {
  const labels = pageLabels(page, search);
  const destination = (page.nav !== null || active?.row.to === '/progress') && labels.length > 0 ? undefined : active?.destination?.label;
  return [active?.row.label, destination, ...labels].filter((label) => label !== undefined);
}

function pageLabels(page: PageManifestEntry, search: string): readonly string[] {
  if (page.breadcrumb === undefined) return [];
  if (typeof page.breadcrumb === 'string') return [page.breadcrumb];
  return page.breadcrumb(new URLSearchParams(search));
}
