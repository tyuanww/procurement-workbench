import { expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationFailedError } from '../../packages/application/src/shared/errors.js';
import { makeCreateUser } from '../../packages/application/src/platform/use-cases/create-user.js';
import { makeGetFreshness } from '../../packages/application/src/platform/use-cases/get-freshness.js';
import { makeGetSettings } from '../../packages/application/src/platform/use-cases/get-settings.js';
import { makeListAuditEntries } from '../../packages/application/src/platform/use-cases/list-audit-entries.js';
import { makeListUsers } from '../../packages/application/src/platform/use-cases/list-users.js';
import { makeUpdateSettings } from '../../packages/application/src/platform/use-cases/update-settings.js';
import { makeUpdateUser } from '../../packages/application/src/platform/use-cases/update-user.js';
import { anActor, aUser, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';

const none = {};

function harness() {
  const memory = createMemory();
  const clock = new FixedClock('2026-10-12T00:00:00.000Z');
  const ids = new SequentialIds();
  const write = { uow: memory.unitOfWork, clock, ids };
  return {
    memory,
    listUsers: makeListUsers({ users: memory.stores.users }),
    createUser: makeCreateUser(write),
    updateUser: makeUpdateUser(write),
    getSettings: makeGetSettings({ settings: memory.stores.settings }),
    updateSettings: makeUpdateSettings({ ...write, settings: memory.stores.settings }),
  };
}

it('非管理员不能列用户，管理员能看到停用用户', async () => {
  const app = harness();
  const stopped = aUser({ active: false, name: '停用甲' });
  await app.memory.stores.users.save(stopped);
  await expect(app.listUsers(none, anActor('buyer'))).rejects.toBeInstanceOf(ForbiddenError);
  const listed = await app.listUsers(none, anActor('admin'));
  expect(listed.map((user) => user.id)).toContain(stopped.id);
  expect(listed.find((user) => user.id === stopped.id)?.active).toBe(false);
});

it('创建和修改用户都写审计，空姓名拒绝', async () => {
  const app = harness();
  const admin = anActor('admin');
  await expect(app.createUser({ name: '  ', roles: ['buyer'] }, admin)).rejects.toBeInstanceOf(ValidationFailedError);
  expect(app.memory.box.current.audit).toHaveLength(0);
  const created = await app.createUser({ name: ' 采购甲 ', roles: ['buyer'] }, admin);
  const user = await app.memory.stores.users.get(created.userId);
  expect(user.name).toBe('采购甲');
  expect(user.active).toBe(true);
  expect(user.feishuOpenId).toBeNull();
  await app.updateUser({ userId: created.userId, roles: ['reviewer'], active: false }, admin);
  const updated = await app.memory.stores.users.get(created.userId);
  expect(updated.roles).toEqual(['reviewer']);
  expect(updated.active).toBe(false);
  expect(app.memory.box.current.audit.map((entry) => entry.action)).toEqual(['user.create', 'user.update']);
  expect(app.memory.box.current.audit[1]?.entity).toBe('用户');
  expect(app.memory.box.current.audit[1]?.before).toMatchObject({ roles: ['buyer'] });
  await expect(app.updateUser({ userId: 'missing', name: '没人' }, admin)).rejects.toBeInstanceOf(NotFoundError);
});

it('两个角色一起创建，用户身上就是这两个码', async () => {
  const app = harness();
  const created = await app.createUser({ name: '双角色', roles: ['buyer', 'reviewer'] }, anActor('admin'));
  const user = await app.memory.stores.users.get(created.userId);
  expect(user.roles).toEqual(['buyer', 'reviewer']);
});

it('改设置写审计，非管理员拒绝，非法天数不落库', async () => {
  const app = harness();
  const admin = anActor('admin');
  const buyer = anActor('buyer');
  expect((await app.getSettings(none, buyer)).upcomingDays).toBe(3);
  await expect(app.updateSettings({ patch: { upcomingDays: 5 } }, buyer)).rejects.toBeInstanceOf(ForbiddenError);
  expect(app.memory.box.current.audit).toHaveLength(0);
  await app.updateSettings({ patch: { upcomingDays: 5 } }, admin);
  expect((await app.getSettings(none, buyer)).upcomingDays).toBe(5);
  expect(app.memory.box.current.audit[0]?.action).toBe('settings.update');
  expect(app.memory.box.current.audit[0]?.entity).toBe('设置');
  await expect(app.updateSettings({ patch: { upcomingDays: -1 } }, admin)).rejects.toBeInstanceOf(ValidationFailedError);
  expect((await app.getSettings(none, admin)).upcomingDays).toBe(5);
});

it('审计列表只有管理员能看，新鲜度所有人能看', async () => {
  const listed = makeListAuditEntries({
    audit: { async list() { return { items: [], page: { page: 1, pageSize: 20, total: 0 } }; } },
  });
  await expect(listed({ page: 1 }, anActor('buyer'))).rejects.toBeInstanceOf(ForbiddenError);
  await expect(listed({ page: 1 }, anActor('admin'))).resolves.toMatchObject({ page: { total: 0 } });
  const freshness = makeGetFreshness({ freshness: { async load() { return { sources: [] }; } } });
  await expect(freshness(none, anActor('lead'))).resolves.toEqual({ sources: [] });
});
