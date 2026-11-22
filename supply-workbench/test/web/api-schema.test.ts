import { expect, it } from 'vitest';
import { SessionUserSchema } from '../../packages/contracts/src/index.js';
import { ApiError, apiGet } from '../../apps/web/src/shared/api/client.js';

it('响应形状不对时抛出错误，不把坏数据交出去', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ nope: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const error = await apiGet('/api/v1/me', SessionUserSchema).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: '内部错误' });
  } finally {
    globalThis.fetch = original;
  }
});
