import { expect, it } from 'vitest';
import { PgBoss } from 'pg-boss';
import { bossScheduler } from '../src/jobs/boss.js';

const DAY_MS = 24 * 60 * 60 * 1000;

it('任务注册先建队列，再接手，再按业务时区排期', async () => {
  const calls: string[] = [];
  await bossScheduler({
    createQueue: async (name) => {
      calls.push(`queue:${name}`);
    },
    work: async (name) => {
      calls.push(`work:${name}`);
      return 'worker';
    },
    schedule: async ({ name, cron, options }) => {
      calls.push(`schedule:${name}:${cron}:${options.tz ?? ''}`);
    },
  }, 'Asia/Shanghai').schedule({ name: 'discard-stale-imports', cron: '0 3 * * *', run: async () => undefined });
  expect(calls).toEqual([
    'queue:discard-stale-imports',
    'work:discard-stale-imports',
    'schedule:discard-stale-imports:0 3 * * *:Asia/Shanghai',
  ]);
});

it('pg-boss 把每天 03:00 预览成间隔一天的两个时刻，非法表达式则拒绝', () => {
  const boss = new PgBoss('postgres://localhost/unused');
  const times = boss.previewSchedule('0 3 * * *', { count: 2 });
  const first = times[0];
  const second = times[1];
  if (first === undefined || second === undefined) throw new Error('预览没有两个时刻');
  expect(second.getTime() - first.getTime()).toBe(DAY_MS);
  expect(() => boss.previewSchedule('not-a-cron')).toThrow();
});
