declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string, options: { readonly url: string; readonly pretendToBeVisual: boolean });
    readonly window: JsdomWindow;
  }
}

type JsdomWindow = Record<string, unknown> & {
  readonly document: unknown;
  getComputedStyle: (element: unknown, pseudo?: string | null) => unknown;
  matchMedia: (query: string) => unknown;
  ResizeObserver: unknown;
};
