import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { loadViews, saveView, type DeskUser } from '../../apps/web/src/features/follow-up/index.js';
import { OwnerControls, loadDeskOwners } from '../../apps/web/src/pages/lines/list/owners.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

it('采购只读自己，不请求用户列表', async () => {
  const storage = memoryStorage();
  saveView({ storage, userId: 'buyer-1', view: { id: 'mine', label: '我的', query: 'buyer=me' } });
  const loaded = await loadRole({ id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true }, []);
  expect(loaded.calls).toEqual(['/api/v1/me']);
  expect(loaded.calls.join(' ')).not.toContain('/api/v1/users');
  expect(loaded.calls.join(' ')).not.toContain('/api/v1/auth/dev/users');
  expect(loaded.userId).toBe('buyer-1');
  expect(loaded.isOwnerVisible).toBe(true);
  expect(loaded.owners).toEqual([{ id: 'buyer-1', name: '采购甲' }]);
  expect(loadViews(storage, loaded.userId)).toEqual([{ id: 'mine', label: '我的', query: 'buyer=me' }]);
  const html = shownAs('buyer', {
    isOwnerVisible: loaded.isOwnerVisible,
    owners: loaded.owners,
    buyerId: loaded.userId,
    onBuyer: () => undefined,
    onAssign: () => undefined,
  });
  expect(html).toContain('采购甲');
  expect(html).toContain('批量分配');
  expect(html).toContain('ant-select');
  expect(html).not.toContain('<select');
});

it('管理员读在职用户，其他角色不出现负责人', async () => {
  const admin = await loadRole({ id: 'admin-1', name: '管理员', roles: ['admin'], devLogin: true }, [
    { id: 'admin-1', name: '管理员', roles: ['admin'], active: true, feishuOpenId: null },
    { id: 'buyer-2', name: '采购乙', roles: ['buyer'], active: true, feishuOpenId: null },
    { id: 'gone', name: '离职', roles: ['buyer'], active: false, feishuOpenId: null },
  ]);
  expect(admin.calls).toEqual(['/api/v1/me', '/api/v1/users']);
  expect(admin.owners.map((user) => user.name)).toEqual(['管理员', '采购乙']);
  const shown = shownAs('admin', {
    isOwnerVisible: admin.isOwnerVisible,
    owners: admin.owners,
    buyerId: 'admin-1',
    onBuyer: () => undefined,
    onAssign: () => undefined,
  });
  expect(shown).toContain('管理员');
  const reviewer = await loadRole({ id: 'rev-1', name: '审核人甲', roles: ['reviewer'], devLogin: true }, []);
  expect(reviewer.calls).toEqual(['/api/v1/me']);
  expect(reviewer.isOwnerVisible).toBe(false);
  const hidden = markup(OwnerControls, {
    isOwnerVisible: reviewer.isOwnerVisible,
    owners: reviewer.owners,
    buyerId: '',
    onBuyer: () => undefined,
    onAssign: () => undefined,
  });
  expect(hidden).not.toContain('批量分配');
  expect(hidden).not.toContain('ant-select');
});

async function loadRole(me: unknown, users: unknown) {
  emptyReads();
  const calls: string[] = [];
  const seen: { userId: string; owners: DeskUser[]; isOwnerVisible: boolean } = {
    userId: '',
    owners: [],
    isOwnerVisible: false,
  };
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    calls.push(url);
    if (url.includes('/api/v1/users')) return jsonBody(users);
    if (url.includes('/api/v1/me')) return jsonBody(me);
    throw new Error(`不该请求 ${url}`);
  };
  try {
    await loadDeskOwners({
      setUserId: (id) => { seen.userId = id; },
      setUsers: (owners) => { seen.owners = [...owners]; },
      setOwnerVisible: (isVisible) => { seen.isOwnerVisible = isVisible; },
    });
  } finally {
    globalThis.fetch = previous;
  }
  return { calls, ...seen };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonBody(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  };
}

function shownAs(role: 'buyer' | 'admin', props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(ActorRoles, { roles: [role], children: react.createElement(OwnerControls, props) }));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function markup(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(type, props));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
