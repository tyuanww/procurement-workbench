import { expect, it } from 'vitest';
import { systemIds } from '../src/system/ids.js';

const SAMPLES = 5000;

it('同一毫秒里连续生成的 id 递增', () => {
  const ids = systemIds();
  let previous = ids.next();
  for (let index = 1; index < SAMPLES; index += 1) {
    const next = ids.next();
    expect(next > previous).toBe(true);
    previous = next;
  }
});
