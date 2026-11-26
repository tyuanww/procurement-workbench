import { createRequire } from 'node:module';
import path from 'node:path';
import { vi } from 'vitest';

type ReactNode = unknown;
type Root = { render(node: ReactNode): void; unmount(): void };
type ReactApi = {
  act: (action: () => void | Promise<void>) => void | Promise<void>;
  createElement: (type: unknown, props?: unknown) => ReactNode;
  useState: <T>(initial: T) => [T, (next: T | ((previous: T) => T)) => void];
};
type RouterApi = {
  MemoryRouter: (props: { readonly initialEntries: readonly string[]; readonly children?: ReactNode }) => ReactNode;
  useSearchParams: () => [URLSearchParams, (next: URLSearchParams, options?: { readonly preventScrollReset?: boolean }) => void];
};

export type FetchCall = {
  readonly url: string;
  readonly signal: AbortSignal | undefined;
  resolve: (value: Response) => void;
  reject: (reason: unknown) => void;
};

const requireWeb = createRequire(path.join(process.cwd(), 'apps/web/package.json'));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

export const calls: FetchCall[] = [];

export function element(type: unknown, props?: unknown): ReactNode {
  return Reflect.apply(react().createElement, undefined, [type, props ?? null]);
}

export function useHostState<T>(initial: T) {
  return react().useState(initial);
}

export function useHostSearch() {
  return router().useSearchParams();
}

export function memoryRouter(children: ReactNode, initialEntry = '/lines?lane=finished&page=2&q=面膜'): ReactNode {
  return element(router().MemoryRouter, { initialEntries: [initialEntry], children });
}

export function mount(node: ReactNode): Root {
  const host = document.createElement('div');
  document.body.append(host);
  const root = client().createRoot(host);
  act(() => { root.render(node); });
  return root;
}

export function act(action: () => void | Promise<void>): void | Promise<void> {
  return react().act(action);
}

export function click(target: HTMLElement): void {
  act(() => { target.click(); });
}

export function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find((item) => compact(item.textContent) === label || item.getAttribute('aria-label') === label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`没有按钮 ${label}`);
  return found;
}

export function textOf(selector: string): string {
  return document.querySelector(selector)?.textContent ?? '';
}

export async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

export async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 2000) throw new Error(`超时，页面是：${document.body.textContent ?? ''}`);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
  }
}

export function installFetch(): void {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    calls.push({ url: String(input), signal: init?.signal ?? undefined, resolve, reject });
  }));
}

export function fulfill(input: { readonly urlPart: string; readonly status: number; readonly body: unknown }): void {
  takeLive(input.urlPart).resolve(jsonResponse(input));
}

export function rejectFetch(input: { readonly urlPart: string; readonly error: Error }): void {
  takeLive(input.urlPart).reject(input.error);
}

export function installMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

export function resetDom(): void {
  calls.splice(0, calls.length);
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
}

function jsonResponse(input: { readonly status: number; readonly body: unknown }): Response {
  return new Response(JSON.stringify(input.body), { status: input.status, headers: { 'content-type': 'application/json' } });
}

function takeLive(urlPart: string): FetchCall {
  const index = calls.findIndex((call) => call.url.includes(urlPart) && call.signal?.aborted !== true);
  const call = calls[index];
  if (call === undefined) throw new Error(`没有待完成请求 ${urlPart}`);
  calls.splice(index, 1);
  return call;
}

function compact(value: string | null): string {
  return (value ?? '').replace(/\s/g, '');
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

function router(): RouterApi {
  const value: unknown = requireWeb('react-router');
  if (!isRouter(value)) throw new Error('react-router 模块不齐');
  return value;
}

function isReact(value: unknown): value is ReactApi {
  return isRecord(value) && typeof value.act === 'function' && typeof value.createElement === 'function' && typeof value.useState === 'function';
}

function isClient(value: unknown): value is { createRoot: (container: Element) => Root } {
  return isRecord(value) && typeof value.createRoot === 'function';
}

function isRouter(value: unknown): value is RouterApi {
  return isRecord(value) && typeof value.MemoryRouter === 'function' && typeof value.useSearchParams === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
