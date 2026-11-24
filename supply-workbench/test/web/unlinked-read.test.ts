import { expect, it } from 'vitest';
import { readUnlinked } from '../../apps/web/src/pages/master/UnlinkedFactoryRows.js';

it('当前待处理上报请求实际页码并传播读取失败', async () => {
  const previous = globalThis.fetch;
  const signal = new AbortController().signal;
  globalThis.fetch = async (url, options) => {
    expect(url).toBe('/api/v1/factory-reports/unlinked?page=2&pageSize=20');
    expect(options?.signal).toBe(signal);
    return new Response('{}', { status: 500 });
  };
  try {
    await expect(readUnlinked(2, signal)).rejects.toMatchObject({ code: 'INTERNAL' });
  } finally {
    globalThis.fetch = previous;
  }
});
