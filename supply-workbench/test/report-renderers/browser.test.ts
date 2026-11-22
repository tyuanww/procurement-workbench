import { once } from 'node:events';
import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import type { WeeklyReportData } from '../../packages/application/src/reporting/views.js';
import { browserRenderers } from '../../packages/report-renderers/src/browser/index.js';

const VIEWPORT_WIDTH = 1600;
const PDF_HEADER = '%PDF';
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;

it('Playwright 导出的 PDF 至少一页，PNG 完整保留跨屏内容', async () => {
  const page = `data:text/html,${encodeURIComponent('<!doctype html><title>周报</title><h1>周报</h1><main style="height:1500px">完整周报</main>')}`;
  const renderers = browserRenderers({ printUrlFor: () => page, reportId: () => 'report-1' });
  const pdf = await renderer(renderers, 'pdf').render(sample());
  const png = await renderer(renderers, 'png').render(sample());
  expect(Buffer.from(pdf.subarray(0, PDF_HEADER.length)).toString()).toBe(PDF_HEADER);
  expect(pdfPages(pdf)).toBeGreaterThan(0);
  expect(pngWidth(png)).toBe(VIEWPORT_WIDTH);
  expect(Buffer.from(png).readUInt32BE(PNG_HEIGHT_OFFSET)).toBeGreaterThan(1500);
}, 120000);

it('签名打印页拒绝访问时，生成文件失败', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(403, { 'content-type': 'text/plain' }).end('打印令牌无效');
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('测试打印页端口未分配');
    const renderers = browserRenderers({ printUrlFor: () => `http://127.0.0.1:${address.port}`, reportId: () => 'report-1' });
    await expect(renderer(renderers, 'pdf').render(sample())).rejects.toThrow(/403/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 120000);

function renderer(renderers: ReturnType<typeof browserRenderers>, format: 'pdf' | 'png') {
  const found = renderers.find((item) => item.format === format);
  if (found === undefined) throw new Error(`没有 ${format}`);
  return found;
}

function pdfPages(bytes: Uint8Array): number {
  return Buffer.from(bytes).toString('latin1').match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;
}

function pngWidth(bytes: Uint8Array): number {
  return Buffer.from(bytes).readUInt32BE(PNG_WIDTH_OFFSET);
}

function sample(): WeeklyReportData {
  return {
    overview: {
      dueBatches: { value: 1, previous: null },
      onTime: { value: { rate: null, n: 0 }, previous: null },
      overdue: { value: 0, previous: null },
      exceptionsOpened: 0,
      exceptionsClosed: 0,
      missingDateRate: null,
    },
    risks: [],
    stuck: [],
    suppliers: [],
    buyers: [],
    exceptions: { opened: 0, closed: 0 },
    dueNextWeek: [],
    notes: { sources: [], basedOnWorkbenchRecords: true },
  };
}
