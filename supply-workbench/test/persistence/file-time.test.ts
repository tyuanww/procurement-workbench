import { expect, it } from 'vitest';
import { modifiedAt } from '../../packages/persistence/src/queries/platform/index.js';

const STORED = '2026-09-21T15:55:33Z';

it('读取已保存的 coreXmlModifiedAt', () => {
  expect(modifiedAt({ coreXmlModifiedAt: STORED })).toBe(STORED);
});

it('两个键都在时只取 coreXmlModifiedAt', () => {
  expect(modifiedAt({ coreXmlModifiedAt: STORED, modifiedAt: '2020-01-01T00:00:00Z' })).toBe(STORED);
});

it('只有旧键 modifiedAt 时返回 null', () => {
  expect(modifiedAt({ modifiedAt: STORED })).toBeNull();
});

it('没有可用的文件时间时返回 null', () => {
  expect(modifiedAt({ coreXmlModifiedAt: null })).toBeNull();
  expect(modifiedAt(null)).toBeNull();
  expect(modifiedAt({})).toBeNull();
});
