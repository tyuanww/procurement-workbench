import { expect, it } from 'vitest';
import { resolveExceptionBuyer } from '../../packages/persistence/src/queries/performance/index.js';

it('异常负责人先取订单行，再回退到批次，仍无负责人时保持未归属', () => {
  expect(resolveExceptionBuyer({ lineBuyerUserId: null, batchBuyerUserId: 'buyer-b' })).toBe('buyer-b');
  expect(resolveExceptionBuyer({ lineBuyerUserId: 'buyer-a', batchBuyerUserId: 'buyer-b' })).toBe('buyer-a');
  expect(resolveExceptionBuyer({ lineBuyerUserId: undefined, batchBuyerUserId: null })).toBeNull();
});
