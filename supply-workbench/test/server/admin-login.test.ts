import { entityId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { devAuth } from '../../packages/auth/src/index.js';
import { aUser, createMemory } from '../../packages/testkit/src/index.js';
import { buildHttpApp } from '../../apps/server/src/http/app.js';

const SEEDED_ADMIN_ID = '0199f0a0-0000-7000-8000-000000000001';
const SECRET = '0123456789abcdef0123456789abcdef';
const PASSWORD = '123456';

it('账号 admin 和访问码 123456 登录为种子管理员，错误密码被拒绝', async () => {
  const memory = createMemory();
  await memory.stores.users.save(aUser({ id: entityId(SEEDED_ADMIN_ID), name: '管理员', roles: ['admin'] }));
  const app = await buildHttpApp({
    auth: devAuth({ directory: memory.directory, accessCode: PASSWORD, secret: SECRET }),
    register: () => undefined,
  });
  const wrong = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: 'admin', accessCode: 'nope' } });
  expect(wrong.statusCode).toBe(401);
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: 'admin', accessCode: PASSWORD } });
  expect(login.statusCode).toBe(200);
  expect(login.json()).toMatchObject({ id: SEEDED_ADMIN_ID, roles: ['admin'] });
  const byId = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: SEEDED_ADMIN_ID, accessCode: PASSWORD } });
  expect(byId.statusCode).toBe(200);
  expect(byId.json()).toMatchObject({ id: SEEDED_ADMIN_ID, roles: ['admin'] });
  await app.close();
});
