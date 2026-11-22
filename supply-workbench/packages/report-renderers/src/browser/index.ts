import type { Browser } from 'playwright';
import type { ReportRenderer } from '../../../application/src/ports/report-renderer.js';
import type { WeeklyReportData } from '../../../application/src/reporting/views.js';

const VIEWPORT_WIDTH = 1600;
const VIEWPORT_HEIGHT = 900;

type Format = 'pdf' | 'png';
type PrintUrl = (reportId: string) => string;
type Origin = string | (() => string);
type ReportId = () => string;

export function browserRenderers(input: { readonly printUrlFor: PrintUrl; readonly reportId: ReportId; readonly origin?: Origin }): ReportRenderer[] {
  return [
    { format: 'pdf', render: (data) => renderPrint(printInput({ input, format: 'pdf', data })) },
    { format: 'png', render: (data) => renderPrint(printInput({ input, format: 'png', data })) },
  ];
}

function printInput({ input, format, data }: { readonly input: { readonly printUrlFor: PrintUrl; readonly reportId: ReportId; readonly origin?: Origin }; readonly format: Format; readonly data: WeeklyReportData }) {
  return {
    data,
    format,
    printUrlFor: input.printUrlFor,
    reportId: input.reportId(),
    ...(input.origin === undefined ? {} : { origin: input.origin }),
  };
}

export async function renderPrint(input: { readonly data?: WeeklyReportData; readonly format: Format; readonly printUrlFor: PrintUrl; readonly origin?: Origin; readonly reportId: string }): Promise<Uint8Array> {
  return capture({ url: absolute(resolveOrigin(input.origin), input.printUrlFor(input.reportId)), format: input.format });
}

async function capture(input: { readonly url: string; readonly format: Format }): Promise<Uint8Array> {
  const browser = await launch();
  try {
    return await shoot(browser, input);
  } finally {
    await browser.close();
  }
}

async function launch(): Promise<Browser> {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch (error) {
    if (!missingBrowser(error)) throw error;
    return chromium.launch({ channel: 'chrome' });
  }
}

function missingBrowser(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Executable doesn't exist");
}

async function shoot(browser: Browser, input: { readonly url: string; readonly format: Format }): Promise<Uint8Array> {
  const page = await browser.newContext({ viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }, deviceScaleFactor: 1 }).then((context) => context.newPage());
  const response = await page.goto(input.url, { waitUntil: 'load' });
  if (response !== null && !response.ok()) throw new Error(`打印页返回 HTTP ${response.status()}`);
  if (input.format === 'png') return page.screenshot({ type: 'png', fullPage: true });
  return page.pdf({ format: 'A4', landscape: true, printBackground: true });
}

function resolveOrigin(origin: Origin | undefined): string | undefined {
  return typeof origin === 'function' ? origin() : origin;
}

function absolute(origin: string | undefined, url: string): string {
  if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('data:') || url.startsWith('file:')) return url;
  if (origin === undefined) throw new Error('打印地址不是绝对地址');
  return `${origin}${url}`;
}
