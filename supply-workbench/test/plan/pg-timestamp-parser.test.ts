import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { eventInstant } from '../../packages/application/src/shared/work-item-event-attribution.js';
import { keepPgTimestampText } from '../../packages/persistence/src/client.js';

const requirePg = createRequire(new URL('../../packages/persistence/package.json', import.meta.url));
const TIMESTAMPTZ_OID = 1184;
const WIRE = '2026-11-09 00:01:00.100200+00';

it('node-pg 默认把 timestamptz 收成毫秒 Date，改成原文后微秒还在', () => {
  const types = pgTypes();
  const collapsed = types.getTypeParser(TIMESTAMPTZ_OID)(WIRE);
  expect(collapsed).toBeInstanceOf(Date);
  if (!(collapsed instanceof Date)) throw new Error('默认解析器没有返回 Date');
  expect(collapsed.toISOString()).toBe('2026-11-09T00:01:00.100Z');
  const previous = types.getTypeParser(TIMESTAMPTZ_OID);
  keepPgTimestampText();
  const text = types.getTypeParser(TIMESTAMPTZ_OID)(WIRE);
  types.setTypeParser(TIMESTAMPTZ_OID, previous);
  expect(text).toBe(WIRE);
  if (typeof text !== 'string') throw new Error('原文丢失');
  expect(eventInstant(text)).toBe('2026-11-09T00:01:00.100200Z');
});

type PgTypes = {
  getTypeParser(oid: number): (value: string) => unknown;
  setTypeParser(oid: number, parser: (value: string) => unknown): void;
};

function pgTypes(): PgTypes {
  const loaded: unknown = requirePg('pg');
  if (!isPg(loaded)) throw new Error('pg 模块没有 types');
  return loaded.types;
}

function isPg(value: unknown): value is { types: PgTypes } {
  return typeof value === 'object' && value !== null && 'types' in value;
}
