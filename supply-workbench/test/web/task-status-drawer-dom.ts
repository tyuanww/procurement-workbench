import { JSDOM } from 'jsdom';

const DOM_NAMES = [
  'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement',
  'DocumentFragment', 'MutationObserver', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLLabelElement',
  'NodeFilter', 'Comment', 'Text', 'Document', 'DOMParser', 'Range',
] as const;

export function installDrawerDom(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/today', pretendToBeVisual: true });
  const { window } = dom;
  const computed = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element) => computed(element);
  for (const name of DOM_NAMES) assignGlobal(name, name === 'window' ? window : window[name]);
  assignGlobal('getComputedStyle', window.getComputedStyle);
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() { return undefined; },
    removeListener() { return undefined; },
    addEventListener() { return undefined; },
    removeEventListener() { return undefined; },
    dispatchEvent() { return false; },
  });
  assignGlobal('matchMedia', window.matchMedia);
  class ResizeObserver {
    observe(): void { return undefined; }
    unobserve(): void { return undefined; }
    disconnect(): void { return undefined; }
  }
  window.ResizeObserver = ResizeObserver;
  assignGlobal('ResizeObserver', ResizeObserver);
  assignGlobal('requestAnimationFrame', (callback: (time: number) => void) => setTimeout(() => callback(0), 0));
  assignGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  assignGlobal('IS_REACT_ACT_ENVIRONMENT', true);
}

function assignGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
