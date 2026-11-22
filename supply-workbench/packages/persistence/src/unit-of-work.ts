import type { UnitOfWork, UnitOfWorkStores } from '../../application/src/ports/unit-of-work.js';
import { placeholderStores } from './repositories/index.js';

export type RollbackJournal = { undo(action: () => void): void };
export type StoreBuilder<TStores extends UnitOfWorkStores = UnitOfWorkStores> = (tx: unknown, journal: RollbackJournal) => TStores;

type Transactional = {
  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
};

export function createUnitOfWork(db: Transactional): UnitOfWork;
export function createUnitOfWork<TStores extends UnitOfWorkStores>(db: Transactional, build: StoreBuilder<TStores>): UnitOfWork<TStores>;
export function createUnitOfWork(db: Transactional, build?: StoreBuilder<UnitOfWorkStores>): UnitOfWork {
  const builder = build ?? (() => placeholderStores());
  return {
    async run(fn) {
      const undos: Array<() => void> = [];
      const journal = { undo(action: () => void) { undos.push(action); } };
      try {
        return await db.transaction(async (tx) => fn(builder(tx, journal)));
      } catch (error) {
        undos.reverse().forEach((undo) => undo());
        throw error;
      }
    },
  };
}
