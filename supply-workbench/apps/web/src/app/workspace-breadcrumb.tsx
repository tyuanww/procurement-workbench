import { Breadcrumb } from 'antd';
import { matchPath, useLocation } from 'react-router';
import { routeAccess, type NavRow } from '../features/shell/index.js';
import { useActorRoles } from '../shared/actor.js';
import { space } from '../theme/tokens.js';
import { PAGE_MANIFEST, type PageManifestEntry } from './page-manifest.js';
import { navigationSelection } from './shell-nav.js';

export function WorkspaceBreadcrumb({ rows, inline = false }: { readonly rows: readonly NavRow[]; readonly inline?: boolean }) {
  const location = useLocation();
  const roles = useActorRoles();
  const page = PAGE_MANIFEST.find(({ path }) => matchPath(path, location.pathname) !== null);
  if (page === undefined || routeAccess({ roles, gate: page.gate ?? 'always' }) !== 'open') return null;
  const active = navigationSelection(rows, location);
  const trail = [active?.row.label, active?.destination?.label].filter((label) => label !== undefined);
  trail.push(...pageLabels(page, location.search));
  if (trail.length === 0) return null;
  const items = trail.map((label, index) => ({
    title: index === trail.length - 1 ? <span aria-current="page">{label}</span> : label,
  }));
  return <Breadcrumb aria-label="当前位置" items={items} style={inline
    ? { minWidth: 0, lineHeight: '20px' }
    : { marginBottom: space[3] }} />;
}

function pageLabels(page: PageManifestEntry, search: string): readonly string[] {
  if (page.breadcrumb === undefined) return [];
  if (typeof page.breadcrumb === 'string') return [page.breadcrumb];
  return page.breadcrumb(new URLSearchParams(search));
}
