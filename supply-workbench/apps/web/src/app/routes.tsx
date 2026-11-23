import { Navigate, Route, Routes, useLocation } from 'react-router';
import { NAV_ROUTES, PAGE_MANIFEST } from './page-manifest.js';
import type { NavRoute } from '../shared/page-manifest.js';
import type { SessionUser } from '@sw/contracts';
import { ActorRoles } from '../shared/actor.js';
import { ForbiddenPage, MissingPage, ReviewQueueProvider, routeAccess, shellView, useShellLoad, type ShellView } from '../features/shell/index.js';
import { Shell } from './Shell.js';
import { LoginPage } from '../pages/login/LoginPage.js';
import { ReportPrintPage } from '../pages/reports/ReportPages.js';


export function AppRoutes({ user }: { readonly user: SessionUser | undefined }) {
  if (user === undefined) return <SignedOutRoutes />;
  return <SignedInRoutes user={user} />;
}

function SignedOutRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<SignInRequired />} />
    </Routes>
  );
}

function SignInRequired() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to="/login" replace state={{ returnTo: pathname + search + hash }} />;
}

function SignedInRoutes({ user }: { readonly user: SessionUser }) {
  return (
    <ActorRoles roles={user.roles}>
    <Routes>
      <Route path="/reports/:id/print" element={<PrintGate user={user} navRoutes={NAV_ROUTES} />} />
      <Route element={<Workbench user={user} />}>
        <Route path="/" element={<Blank />} />
        <Route path="/login" element={<Blank />} />
        {PAGE_MANIFEST.map((entry) => (
          <Route key={entry.path} path={entry.path} element={entry.element} />
        ))}
        <Route path="*" element={<MissingPage />} />
      </Route>
    </Routes>
    </ActorRoles>
  );
}

function Workbench({ user }: { readonly user: SessionUser }) {
  const loaded = useShellLoad({ name: user.name, roles: user.roles });
  const view = shellView({
    user,
    queue: loaded.queue,
    today: loaded.today,
    freshness: loaded.freshness,
    now: loaded.now,
    navRoutes: NAV_ROUTES,
  });
  return (
    <ReviewQueueProvider refresh={loaded.refreshReviewQueue}>
      <ShellGate view={view} roles={user.roles} navRoutes={NAV_ROUTES} />
    </ReviewQueueProvider>
  );
}

function ShellGate({ view, roles, navRoutes }: { readonly view: ShellView; readonly roles: SessionUser['roles']; readonly navRoutes: readonly NavRoute[] }) {
  const location = useLocation();
  if (isHomeGate(location.pathname)) return <HomeGate home={view.home} />;
  return <Shell view={view} roles={roles} navRoutes={navRoutes} />;
}

function PrintGate({ user, navRoutes }: { readonly user: SessionUser; readonly navRoutes: readonly NavRoute[] }) {
  const location = useLocation();
  if (routeAccess({ roles: user.roles, pathname: location.pathname, navRoutes }) === 'forbidden') return <ForbiddenPage />;
  return <ReportPrintPage />;
}

function isHomeGate(pathname: string): boolean {
  return pathname === '/' || pathname === '/login';
}

function HomeGate({ home }: { readonly home: ShellView['home'] }) {
  if (home === undefined) return null;
  return <Navigate to={home} replace />;
}

function Blank(): null {
  return null;
}
