import type { ImportBatch } from '@sw/domain';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { revisionOf, saveImportRevision } from './revision.js';

export type FactorySnapshotReplay = {
  readonly existing: ImportBatch;
};

export async function findFactorySnapshotReplay(input: { readonly tx: UnitOfWorkStores; readonly batch: ImportBatch }): Promise<FactorySnapshotReplay | undefined> {
  if (input.batch.template !== 'factory-progress-v1' || input.batch.sourceKey === null || input.batch.sourceKey === undefined) return undefined;
  const fingerprint = input.batch.sourceFingerprint ?? input.batch.fileId;
  const existing = (await input.tx.imports.list()).find((item) => item.id !== input.batch.id && item.status === 'committed' && item.sourceKey === input.batch.sourceKey && (item.sourceFingerprint ?? item.fileId) === fingerprint);
  return existing === undefined ? undefined : { existing };
}

export async function retireFactorySnapshot(input: { readonly tx: UnitOfWorkStores; readonly batch: ImportBatch; readonly at: string }): Promise<void> {
  if (input.batch.template !== 'factory-progress-v1' || input.batch.sourceKey === null || input.batch.sourceKey === undefined) return;
  const active = (await input.tx.imports.list()).filter((item) => item.id !== input.batch.id && item.status === 'committed' && item.sourceKey === input.batch.sourceKey && (item.supersededAt ?? null) === null);
  for (const previous of active) {
    const next = { ...previous, revision: revisionOf(previous.revision) + 1, supersededAt: input.at, updatedAt: input.at };
    await saveImportRevision({ repo: input.tx.imports, next, expectedRevision: revisionOf(previous.revision) });
  }
}
