import { expect, it } from 'vitest';
import { readUnlinked } from '../../apps/web/src/pages/master/MasterPage.js';

it('未关联上报读失败时写出原因，不当成空成功', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  try {
    const loaded = await readUnlinked();
    expect(loaded.error).toBe('未关联上报没有读出来。');
    expect(loaded.rows).toEqual([]);
  } finally {
    globalThis.fetch = previous;
  }
});
