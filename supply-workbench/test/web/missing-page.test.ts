// @vitest-environment happy-dom
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { entityId, type Role } from '../../packages/domain/src/index.js';
import { AppRoutes } from '../../apps/web/src/app/routes.js';

const requireWeb = createRequire(path.join(process.cwd(), 'apps/web/package.json'));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type ReactNode = unknown;
type Root = { render(node: ReactNode): void; unmount(): void };
type ReactApi = {
  readonly Fragment: unknown;
  act: (action: () => void | Promise<void>) => unknown;
  createElement: (type: unknown, props: unknown) => ReactNode;
};
type RouterApi = {
  readonly MemoryRouter: unknown;
  useLocation: () => unknown;
  useNavigate: () => unknown;
};

let root: Root | undefined;

afterEach(() => {
  root?.unmount();
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('已登录直接打开未知地址时留下该地址，并给出返回今日', async () => {
  stubFetch();
  mount('/aaa', ['buyer']);
  await textHas('页面不存在');
  expect(pathName()).toBe('/aaa');
  expect(document.body.textContent ?? '').not.toContain('这个角色看不到这页。');
  expect(linkHref('返回今日')).toBe('/today');
  expect(window.location.pathname).not.toBe('/aaa');
});

it('从今日同文档走到未知地址，再返回今日，地址栏不整页跳转', async () => {
  stubFetch();
  const assigned = watchAssign();
  mount('/today', ['buyer']);
  await textHas('今日');
  clickButton('走到未知页');
  await textHas('页面不存在');
  expect(pathName()).toBe('/aaa');
  expect(window.location.pathname).not.toBe('/aaa');
  clickLink('返回今日');
  await textHas('今日');
  expect(pathName()).toBe('/today');
  expect(document.body.textContent ?? '').not.toContain('页面不存在');
  expect(assigned.count).toBe(0);
});

it('未登录未知地址仍进入登录，不显示页面不存在', async () => {
  stubFetch();
  mount('/aaa', undefined);
  await textHas('供应链工作台登录');
  expect(pathName()).toBe('/login');
  expect(document.body.textContent ?? '').not.toContain('页面不存在');
});

it('合法页面和没有权限的页面都不改成页面不存在', () => {
  stubFetch();
  const lines = markup('/lines', ['buyer']);
  expect(lines).not.toContain('页面不存在');
  expect(lines).toContain('跟进台');
  const denied = markup('/dashboard', ['buyer']);
  expect(denied).toContain('这个角色看不到这页。');
  expect(denied).not.toContain('页面不存在');
  const printDenied = markup('/reports/r1/print', ['buyer']);
  expect(printDenied).toContain('这个角色看不到这页。');
  expect(printDenied).not.toContain('页面不存在');
  const home = markup('/', ['buyer']);
  expect(home).not.toContain('页面不存在');
});

function mount(pathname: string, roles: readonly Role[] | undefined): void {
  const host = document.createElement('div');
  document.body.append(host);
  const created = client().createRoot(host);
  act(() => { created.render(node(router().MemoryRouter, { initialEntries: [pathname], children: screen(roles) })); });
  root = created;
}

function screen(roles: readonly Role[] | undefined): ReactNode {
  const user = roles === undefined ? undefined : { id: entityId('user-1'), name: '用户', roles };
  const page = node(antdApp(), { children: node(AppRoutes, { user, devLogin: false }) });
  return node(react().Fragment, { children: [node(PathMark, null), node(Jump, null), page] });
}

function PathMark(): ReactNode {
  const location = router().useLocation();
  if (!isRecord(location) || typeof location.pathname !== 'string') throw new Error('没有地址');
  return node('p', { id: 'path', children: location.pathname });
}

function Jump(): ReactNode {
  const navigate = router().useNavigate();
  return node('button', { type: 'button', onClick: () => go(navigate, '/aaa'), children: '走到未知页' });
}

function go(navigate: unknown, pathname: string): void {
  if (typeof navigate !== 'function') throw new Error('没有导航');
  Reflect.apply(navigate, undefined, [pathname]);
}

function markup(pathname: string, roles: readonly Role[]): string {
  const page = node(AppRoutes, { user: { id: entityId('user-1'), name: '用户', roles }, devLogin: false });
  const html = server().renderToStaticMarkup(node(router().MemoryRouter, { initialEntries: [pathname], children: page }));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function clickButton(label: string): void {
  const found = [...document.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`没有按钮 ${label}`);
  act(() => { found.click(); });
}

function clickLink(label: string): void {
  const found = [...document.querySelectorAll('a')].find((item) => item.textContent === label);
  if (!(found instanceof HTMLAnchorElement)) throw new Error(`没有链接 ${label}`);
  act(() => { found.click(); });
}

function pathName(): string {
  return document.querySelector('#path')?.textContent ?? '';
}

function linkHref(label: string): string | null {
  const found = [...document.querySelectorAll('a')].find((item) => item.textContent === label);
  return found instanceof HTMLAnchorElement ? found.getAttribute('href') : null;
}

async function textHas(text: string): Promise<void> {
  const started = Date.now();
  while (!(document.body.textContent ?? '').includes(text)) {
    if (Date.now() - started > 2000) throw new Error(`超时，页面是：${document.body.textContent ?? ''}`);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
  }
}

function stubFetch(): void {
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }));
}

function watchAssign(): { count: number } {
  const seen = { count: 0 };
  Object.defineProperty(window.location, 'assign', { configurable: true, value: () => { seen.count += 1; } });
  return seen;
}

function node(type: unknown, props: unknown): ReactNode {
  return react().createElement(type, props);
}

function act(action: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(react().act(action)).then(() => undefined);
}

function react(): ReactApi {
  const value: unknown = requireWeb('react');
  if (!isReact(value)) throw new Error('react 模块不齐');
  return value;
}

function client(): { createRoot: (container: Element) => Root } {
  const value: unknown = requireWeb('react-dom/client');
  if (!isClient(value)) throw new Error('react-dom 模块不齐');
  return value;
}

function server(): { renderToStaticMarkup: (target: ReactNode) => unknown } {
  const value: unknown = requireWeb('react-dom/server');
  if (!isServer(value)) throw new Error('react-dom/server 模块不齐');
  return value;
}

function antdApp(): unknown {
  const value: unknown = requireWeb('antd');
  if (!isRecord(value) || !isRecord(value.App)) throw new Error('antd 模块不齐');
  return value.App;
}

function router(): RouterApi {
  const value: unknown = requireWeb('react-router');
  if (!isRouter(value)) throw new Error('react-router 模块不齐');
  return value;
}

function isReact(value: unknown): value is ReactApi {
  return isRecord(value) && typeof value.createElement === 'function' && typeof value.act === 'function' && 'Fragment' in value;
}

function isClient(value: unknown): value is { createRoot: (container: Element) => Root } {
  return isRecord(value) && typeof value.createRoot === 'function';
}

function isServer(value: unknown): value is { renderToStaticMarkup: (target: ReactNode) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRouter(value: unknown): value is RouterApi {
  return isRecord(value) && typeof value.MemoryRouter === 'function' && typeof value.useLocation === 'function' && typeof value.useNavigate === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
