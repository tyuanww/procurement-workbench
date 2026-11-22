import type { Role } from '@sw/domain';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { devAuth } from '@sw/auth';
import { createDb, fileStore, migrate, seed, userDirectory } from '@sw/persistence';
import { composePlatform, platformHealth } from '../../src/composition/platform.js';
import { buildHttpApp, type HttpApp } from '../../src/http/app.js';
import { registerPlatformRoutes } from '../../src/http/platform/routes.js';
import type { JobTrigger } from '../../src/jobs/runner.js';

const SECRET = '0123456789abcdef0123456789abcdef';
const CODE = 'dev-code';
const ROLE_USER: Record<Role, string> = {
  admin: '0199f0a0-0000-7000-8000-000000000001',
  buyer: '0199f0a0-0000-7000-8000-000000000002',
  reviewer: '0199f0a0-0000-7000-8000-000000000004',
  manager: '0199f0a0-0000-7000-8000-000000000005',
  lead: '0199f0a0-0000-7000-8000-000000000006',
};

export async function createTestServer(serveWebDir?: string): Promise<{
  readonly app: HttpApp;
  readonly triggers: readonly JobTrigger[];
  readonly loginAs: (role: Role) => Promise<string>;
  close(): Promise<void>;
}> {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-uploads-'));
  const composed = composePlatform({
    db: handle.db,
    timeZone: 'Asia/Shanghai',
    weeklyCron: null,
    files: fileStore(uploadDir),
    health: () => platformHealth(handle.exec),
  });
  const app = await buildHttpApp({
    ...(serveWebDir === undefined ? {} : { serveWebDir }),
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: CODE, secret: SECRET }),
    register: (server) => registerPlatformRoutes({ app: server, api: composed.api, devLogin: true, businessTimeZone: 'Asia/Shanghai' }),
  });
  return {
    app,
    triggers: composed.triggers,
    loginAs: (role) => loginAs(app, role),
    close: async () => {
      await app.close();
      await handle.close();
      await rm(uploadDir, { recursive: true });
    },
  };
}

export async function loginAs(app: HttpApp, role: Role): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: ROLE_USER[role], accessCode: CODE } });
  const header = login.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(';')[0] ?? '';
}
