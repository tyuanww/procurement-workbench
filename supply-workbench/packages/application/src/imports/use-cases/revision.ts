import type { ImportBatch } from '@sw/domain';
import type { ImportBatchRepository } from '../../ports/import-batch-repository.js';
import { StateConflictError } from '../../shared/errors.js';

export async function saveImportRevision(input: { readonly repo: ImportBatchRepository; readonly next: ImportBatch; readonly expectedRevision?: number | undefined }): Promise<void> {
  const nextRevision = revisionOf(input.next.revision);
  const expected = input.expectedRevision ?? Math.max(nextRevision - 1, 0);
  if (nextRevision !== expected + 1) throw new StateConflictError('revision');
  if (input.repo.saveConditional !== undefined) {
    if (!(await input.repo.saveConditional(input.next, expected))) throw new StateConflictError('revision');
    return;
  }
  const latest = await input.repo.find(input.next.id);
  if (latest !== undefined && revisionOf(latest.revision) !== expected) throw new StateConflictError('revision');
  await input.repo.save({ ...input.next, revision: expected + 1 });
}

export function revisionOf(value: number | undefined): number {
  return value === undefined ? 0 : value;
}
