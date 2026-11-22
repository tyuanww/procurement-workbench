import { PgBoss } from 'pg-boss';
import type { JobScheduler } from './runner.js';

export type BossQueue = {
  createQueue(name: string): Promise<void>;
  schedule(input: { readonly name: string; readonly cron: string; readonly options: { readonly tz?: string } }): Promise<void>;
  work(name: string, handler: () => Promise<void>): Promise<string>;
};

export function bossScheduler(boss: BossQueue, timeZone: string): JobScheduler {
  return {
    async schedule({ name, cron, run }: { readonly name: string; readonly cron: string; readonly run: () => Promise<void> }) {
      await boss.createQueue(name);
      await boss.work(name, run);
      await boss.schedule({ name, cron, options: { tz: timeZone } });
    },
  };
}

export async function startBoss(connectionString: string, timeZone: string): Promise<{ readonly scheduler: JobScheduler; stop(): Promise<void> }> {
  const boss = new PgBoss(connectionString);
  // pg-boss 在数据库连接中断时会 emit 'error' 事件。EventEmitter 未处理的
  // 'error' 会直接终止 Node 进程, 使容器反复重启(每次 ~2s 不可用)。
  // 这里兜底记录, 让瞬时数据库抖动不再打掉整个应用。
  boss.on('error', (err: unknown) => {
    console.error('[pg-boss] scheduler error:', err instanceof Error ? err.message : err);
  });
  await boss.start();
  return {
    scheduler: bossScheduler({
      createQueue: (name) => boss.createQueue(name),
      work: (name, handler) => boss.work(name, handler),
      schedule: ({ name, cron, options }: { readonly name: string; readonly cron: string; readonly options: { readonly tz?: string; } }) => boss.schedule(name, cron, null, options),
    }, timeZone),
    stop: () => boss.stop(),
  };
}
