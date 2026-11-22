import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import type { ImportBatch, ImportRow } from '@sw/domain';
import type { Actor } from '../../shared/actor.js';

export type CommitContext = {
  readonly tx: UnitOfWorkStores;
  readonly batch: ImportBatch;
  readonly rows: readonly ImportRow[];
  readonly at: string;
  readonly actor: Actor;
};

export type CommitExecutor = {
  readonly template: ImportBatch['template'];
  run(ctx: CommitContext): Promise<CommitResult>;
};

export type CommitResult = {
  readonly affectedLineIds: readonly string[];
  readonly presentLineIds: readonly string[];
};
