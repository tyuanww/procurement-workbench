import { expect, it } from 'vitest';
import { coverFile } from '../../packages/persistence/src/queries/product-archive/cover.js';

it('封面丢掉隐藏图，按顺序、内页、编号挑选', () => {
  const images = [
    image({ id: 'b', slot: 'outer', order: 1, hiddenAt: null }),
    image({ id: 'a', slot: 'inner', order: 1, hiddenAt: null }),
    image({ id: 'c', slot: 'inner', order: 0, hiddenAt: '2026-10-01T00:00:00.000Z' }),
    image({ id: 'd', slot: 'outer', order: 0, hiddenAt: null }),
  ];
  expect(coverFile(images)).toEqual({ fileId: 'file-d' });
  expect(coverFile(images.filter((item) => item.id !== 'd'))).toEqual({ fileId: 'file-a' });
  expect(coverFile(images.map((item) => ({ ...item, hiddenAt: '2026-10-01T00:00:00.000Z' })))).toBeNull();
});

function image(input: { readonly id: string; readonly slot: string; readonly order: number; readonly hiddenAt: string | null }) {
  return { id: input.id, slot: input.slot, fileId: `file-${input.id}`, order: input.order, hiddenAt: input.hiddenAt };
}
