import { Navigate, Route, Routes, useLocation } from 'react-router';
import { NAV_ROUTES, PAGE_MANIFEST, type PageManifestEntry } from './page-manifest.js';
import type { SessionUser } from '@sw/contracts';
import { ActorRoles } from '../shared/actor.js';
import { ForbiddenPage, MissingPage, ReviewQueueProvider, routeAccess, shellView, useShellLoad, type ShellView } from '../features/shell/index.js';
import { Shell } from './Shell.js';
import { LoginPage } from '../pages/login/LoginPage.js';


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
    <ActorRoles roles={user.roles} userId={user.id}>
      <Routes>
        {PAGE_MANIFEST.filter((entry) => entry.standalone).map((entry) => pageRoute(entry, user.roles))}
        <Route element={<Workbench user={user} />}>
          <Route path="/" element={<Blank />} />
          <Route path="/login" element={<Blank />} />
          {PAGE_MANIFEST.filter((entry) => !entry.standalone).map((entry) => pageRoute(entry, user.roles))}
          <Route path="*" element={<MissingPage />} />
        </Route>
      </Routes>
    </ActorRoles>
  );
}

function pageRoute(entry: PageManifestEntry, roles: SessionUser['roles']) {
  const access = routeAccess({ roles, gate: entry.gate ?? 'always' });
  return <Route key={entry.path} path={entry.path} element={access === 'open' ? entry.element : <ForbiddenPage />} />;
}

function Workbench({ user }: { readonly user: SessionUser }) {
  const { pathname } = useLocation();
  const loaded = useShellLoad({ name: user.name, roles: user.roles, pathname });
  const view = shellView({
    user,
    queue: loaded.queue,
    today: loaded.today,
    procurementDate: loaded.procurementDate,
    navRoutes: NAV_ROUTES,
  });
  if (isHomeGate(pathname)) return <HomeGate home={view.home} />;
  return (
    <ReviewQueueProvider refresh={loaded.refreshReviewQueue}>
      <Shell view={{ ...view, userId: user.id }} />
    </ReviewQueueProvider>
  );
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
