import { expect, it, vi } from 'vitest';
import { postReceipt } from '../../apps/web/src/features/follow-up/record-forms/commands.js';

it('收货回执丢失后原值重试共用请求键，确认成功后才开启下一次登记', async () => {
  const receipt = { batchId: 'retry-batch', qty: 2, receivedOn: '2026-11-26', category: 'finished' as const };
  const attempts: (string | null)[] = [];
  const send = vi.fn((_path: string, init?: RequestInit) => {
    attempts.push(new Headers(init?.headers).get('idempotency-key'));
    if (attempts.length === 1) return Promise.reject(new TypeError('连接已断开'));
    return Promise.resolve(Response.json({
      ...receipt, id: 'receipt-created', source: 'workbench', createdBy: 'buyer',
      note: null, voidedAt: null, voidedBy: null, voidReason: null,
    }));
  });
  vi.stubGlobal('fetch', send);
  try {
    await expect(postReceipt(receipt)).rejects.toThrow('连接已断开');
    await postReceipt(receipt);
    await postReceipt(receipt);
    expect(attempts[0]).toBeTruthy();
    expect(attempts[1]).toBe(attempts[0]);
    expect(attempts[2]).not.toBe(attempts[0]);
  } finally {
    vi.unstubAllGlobals();
  }
});
