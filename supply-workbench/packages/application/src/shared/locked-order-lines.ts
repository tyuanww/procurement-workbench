import type { OrderLine } from '@sw/domain';
import type { OrderLineRepository } from '../ports/order-line-repository.js';
import type { UnitOfWork, UnitOfWorkStores } from '../ports/unit-of-work.js';
import { isOrderLineLockBusy, NotFoundError } from './errors.js';

export async function retryOrderLineLock<T>(uow: UnitOfWork, run: (tx: UnitOfWorkStores) => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await uow.run(run);
    } catch (error) {
      if (!isOrderLineLockBusy(error)) throw error;
      // 上一次事务已回滚。单独等这一行，再从头读取业务数据。
      await uow.run((tx) => lockOrderLines(tx.orderLines, [error.lineId]));
    }
  }
}

export async function lockOrderLines(repository: Pick<OrderLineRepository, 'lock'>, ids: readonly string[]): Promise<Map<string, OrderLine>> {
  const lines = new Map<string, OrderLine>();
  for (const id of [...new Set(ids)].sort()) {
    try {
      lines.set(id, await repository.lock(id));
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }
  return lines;
}

export function requireLockedOrderLine(lines: ReadonlyMap<string, OrderLine>, id: string): OrderLine {
  const line = lines.get(id);
  if (line === undefined) throw new NotFoundError('订单行', id);
  return line;
}
