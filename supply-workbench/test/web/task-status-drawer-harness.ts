import { createRequire } from 'node:module';
import { installDrawerDom } from './task-status-drawer-dom.ts';

installDrawerDom();

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

export type Exchange = { readonly url: string; readonly method: string; readonly body: unknown };

type Pending = Exchange & { resolve: (response: Response) => void; reject: (reason: unknown) => void; settled: boolean };
type ReactModule = { act: (callback: () => unknown) => Promise<unknown>; createElement: (type: unknown, props: unknown) => unknown };
type Root = { render: (node: unknown) => void; unmount: () => void };
type ButtonNode = { click: () => void; disabled: boolean; textContent: string | null };

const pending: Pending[] = [];
const settled: Exchange[] = [];

export function installFetch(): void {
  pending.length = 0;
  settled.length = 0;
  globalThis.fetch = (input, init) => new Promise((resolve, reject) => {
    pending.push(listen({ exchange: exchangeOf(input, init), resolve, reject, signal: init?.signal }));
  });
}

function exchangeOf(input: RequestInfo | URL, init: RequestInit | undefined): Exchange {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return { url, method: init?.method ?? 'GET', body: parseBody(typeof init?.body === 'string' ? init.body : null) };
}

function parseBody(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value;
  } catch { return raw; }
}

function listen(input: { readonly exchange: Exchange; readonly resolve: (response: Response) => void; readonly reject: (reason: unknown) => void; readonly signal: AbortSignal | null | undefined }): Pending {
  const item: Pending = { ...input.exchange, resolve: input.resolve, reject: input.reject, settled: false };
  const abort = () => {
    if (item.settled) return;
    item.settled = true;
    input.reject(new DOMException('The operation was aborted.', 'AbortError'));
  };
  if (input.signal?.aborted === true) abort();
  else input.signal?.addEventListener('abort', abort, { once: true });
  return item;
}

export function posts(): readonly Exchange[] {
  const open = pending.filter((item) => item.method === 'POST' && !item.settled);
  const done = settled.filter((item) => item.method === 'POST');
  return open.map(exchangeOnly).concat(done);
}

function exchangeOnly(item: Exchange): Exchange {
  return { url: item.url, method: item.method, body: item.body };
}

export function detail(input: { readonly id: string; readonly title: string; readonly status: string; readonly dependenciesIn?: readonly unknown[] }): unknown {
  return {
    item: {
      id: input.id, subjectType: 'standalone', subjectId: null, kind: 'task', title: input.title,
      ownerUserId: null, ownerName: null, counterpartyPartyId: null, counterpartyRole: null, counterpartyName: null,
      plannedStart: '2026-11-17', plannedEnd: '2026-11-17', status: input.status, priority: 'normal', source: 'manual',
      parentId: null, version: 3, overdueDays: null, orderLine: null, batch: null,
      supplierPartyId: null, supplierName: null, factoryPartyId: null, factoryName: null,
    },
    events: [],
    dependenciesOut: [],
    dependenciesIn: input.dependenciesIn ?? [],
  };
}

export type DrawerHandle = {
  readonly react: ReactModule;
  set(next: { readonly workItemId: string | null; readonly isOpen: boolean }): Promise<void>;
  unmount(): Promise<void>;
  click(label: string): Promise<void>;
  isDisabled(label: string): boolean | null;
  selected(): string | null;
  tag(): string;
  text(): string;
};

export async function mountDrawer(): Promise<DrawerHandle> {
  const react = reactOf();
  const reactDom = rootOf();
  const router = routerOf();
  const { ActorRoles } = await import('../../apps/web/src/shared/actor.tsx');
  const { TaskDrawer } = await import('../../apps/web/src/features/plan/TaskDrawer.tsx');
  document.body.textContent = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = reactDom.createRoot(container);
  let workItemId: string | null = null;
  let isOpen = false;
  const tree = () => react.createElement(router.MemoryRouter, { children: react.createElement(ActorRoles, {
    roles: ['buyer'],
    children: react.createElement(TaskDrawer, { workItemId, isOpen, onClose: () => undefined, onChanged: () => undefined }),
  }) });
  return drawerHandle({ react, root, tree, apply: (next) => { workItemId = next.workItemId; isOpen = next.isOpen; } });
}

function drawerHandle(input: { readonly react: ReactModule; readonly root: Root; readonly tree: () => unknown; readonly apply: (next: { readonly workItemId: string | null; readonly isOpen: boolean }) => void }): DrawerHandle {
  return {
    react: input.react,
    async unmount() { await input.react.act(async () => { input.root.unmount(); }); },
    async set(next) {
      input.apply(next);
      await input.react.act(async () => { input.root.render(input.tree()); });
    },
    async click(label) {
      const found = findButton(label);
      if (found === null) throw new Error(`没有按钮 ${label}`);
      await input.react.act(async () => { found.click(); });
    },
    isDisabled(label) {
      return findButton(label)?.disabled ?? null;
    },
    selected() {
      const text = document.querySelector('.ant-segmented-item-selected')?.textContent?.replace(/\s+/g, '') ?? '';
      return text === '' ? null : text;
    },
    tag() {
      return document.querySelector('.ant-tag')?.textContent?.replace(/\s+/g, '') ?? '';
    },
    text() { return document.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''; },
  };
}

function findButton(label: string): ButtonNode | null {
  for (const node of document.querySelectorAll('button')) {
    if ((node.textContent?.replace(/\s+/g, '') ?? '') === label) return node;
  }
  return null;
}

function reactOf(): ReactModule {
  const value: unknown = requireWeb('react');
  if (!isReact(value)) throw new Error('react 模块不齐');
  return value;
}

function isReact(value: unknown): value is ReactModule {
  return isRecord(value) && typeof value.act === 'function' && typeof value.createElement === 'function';
}

function routerOf(): { MemoryRouter: unknown } {
  const value: unknown = requireWeb('react-router');
  if (!isRecord(value) || !('MemoryRouter' in value)) throw new Error('路由模块不齐');
  return { MemoryRouter: value.MemoryRouter };
}

function rootOf(): { createRoot: (element: HTMLElement) => Root } {
  const value: unknown = requireWeb('react-dom/client');
  if (!isRootFactory(value)) throw new Error('react-dom 模块不齐');
  return value;
}

function isRootFactory(value: unknown): value is { createRoot: (element: HTMLElement) => Root } {
  return isRecord(value) && typeof value.createRoot === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function resolveGet(input: { readonly act: ReactModule['act']; readonly urlPart: string; readonly body: unknown }): Promise<void> {
  await settle({ ...input, method: 'GET', status: 200 });
}

export async function resolvePost(input: { readonly act: ReactModule['act']; readonly urlPart: string; readonly body: unknown; readonly status?: number }): Promise<void> {
  await settle({ act: input.act, method: 'POST', urlPart: input.urlPart, body: input.body, status: input.status ?? 200 });
}

async function settle(input: { readonly act: ReactModule['act']; readonly method: string; readonly urlPart: string; readonly body: unknown; readonly status: number }): Promise<void> {
  const matches = pending.filter((entry) => !entry.settled && entry.method === input.method && entry.url.includes(input.urlPart));
  const item = matches.at(-1);
  if (item === undefined) throw new Error(`没有 ${input.method} ${input.urlPart}`);
  item.settled = true;
  settled.push({ url: item.url, method: item.method, body: item.body });
  const response = new Response(JSON.stringify(input.body), { status: input.status, headers: { 'content-type': 'application/json' } });
  await input.act(async () => { item.resolve(response); });
}
