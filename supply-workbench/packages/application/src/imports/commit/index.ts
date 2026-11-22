import type { CommitExecutor } from './context.js';

let bound: readonly CommitExecutor[] = [];

export function bindCommitExecutors(executors: readonly CommitExecutor[]): void {
  bound = executors;
}

export function commitExecutors(): readonly CommitExecutor[] {
  return bound;
}
