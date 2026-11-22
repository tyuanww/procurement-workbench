import { afterEach, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { businessToday } from '../../apps/web/src/features/follow-up/record-forms/defaults.js';
import { shanghaiToday } from '../../apps/web/src/features/performance/model/period.js';
import { formatDateTime, formatTableDate } from '../../apps/web/src/shared/ui/format.js';
import { setBusinessTimeZone } from '../../apps/web/src/shared/business-time-zone.js';
import { DEFAULT_BUSINESS_TIME_ZONE } from '../../apps/web/src/shared/config.js';

afterEach(() => setBusinessTimeZone(DEFAULT_BUSINESS_TIME_ZONE));

it('业务日跨午夜时使用注入的业务时区', () => {
  setBusinessTimeZone('America/Los_Angeles');
  expect(businessToday('America/Los_Angeles', new Date('2026-01-01T07:59:59.000Z'))).toBe('2025-12-31');
  expect(businessToday('America/Los_Angeles', new Date('2026-01-01T08:00:00.000Z'))).toBe('2026-01-01');
  expect(shanghaiToday(new Date('2026-01-01T07:59:59.000Z'), 'America/Los_Angeles')).toBe('2025-12-31');
});

it('日期格式化覆盖 DST 转换', () => {
  setBusinessTimeZone('America/New_York');
  expect(formatDateTime('2026-03-08T06:59:00.000Z', 'America/New_York')).toBe('2026-03-08 01:59');
  expect(formatDateTime('2026-03-08T07:01:00.000Z', 'America/New_York')).toBe('2026-03-08 03:01');
  expect(formatTableDate({ iso: '2026-03-08T04:59:00.000Z', now: new Date('2026-03-08T12:00:00.000Z'), timeZone: 'America/New_York' })).toBe('03-07');
});

it('业务源码不再散落硬编码上海时区', async () => {
  const root = path.resolve(process.cwd(), 'apps/web/src');
  const files = (await walk(root)).filter((file) => !file.endsWith('/shared/config.ts'));
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  expect(contents.some((content) => content.includes('Asia/Shanghai'))).toBe(false);
});

async function walk(dir: string): Promise<string[]> {
  const entries = await (await import('node:fs/promises')).readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(file);
  }
  return files;
}
