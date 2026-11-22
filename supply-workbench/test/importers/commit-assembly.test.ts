import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

it('提交执行器在 composition 装配，注册表加载时不绑定', () => {
  expect(read('packages/importers/src/registry.ts').includes('bindCommitExecutors')).toBe(false);
  expect(read('apps/server/src/composition/imports.ts').includes('bindCommitExecutors(importCommitExecutors)')).toBe(true);
});

function read(relative: string): string {
  return readFileSync(path.join(root, relative), 'utf8');
}
