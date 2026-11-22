import type { ImportBatch } from '@sw/domain';
import type { ImportBatchRepository } from '../../ports/import-batch-repository.js';
import type { PoMasterPayload } from '../../ports/parsed-rows.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';

type KnownPo = { readonly candidateKey: string; readonly values: PoMasterPayload };

export async function latestPoMaster(tx: UnitOfWorkStores): Promise<readonly KnownPo[]> {
  const rows = await tx.imports.listCurrentPoMasterRows?.();
  if (rows !== undefined) {
    return rows.flatMap(({ candidateKey, parsed }) => {
      const values = poPayload(parsed);
      return values === null ? [] : [{ candidateKey, values }];
    });
  }
  const found = new Map<string, PoMasterPayload>();
  for (const batch of [...await appliedPoMasterBatches(tx.imports)].sort(byCommitOrder)) {
    await rememberBatch({ tx, batch, found });
  }
  return [...found].map(([candidateKey, values]) => ({ candidateKey, values }));
}

export async function appliedPoMasterBatches(repo: ImportBatchRepository): Promise<readonly ImportBatch[]> {
  return await repo.listAppliedPoMasterBatches?.()
    ?? (await repo.list()).filter((batch) => batch.template === 'po-master-v1' && batch.status === 'committed');
}

async function rememberBatch(input: { readonly tx: UnitOfWorkStores; readonly batch: ImportBatch; readonly found: Map<string, PoMasterPayload> }): Promise<void> {
  for (const row of await input.tx.imports.listRows(input.batch.id)) {
    if (row.action === 'skip' || row.action === 'conflict') continue;
    const values = poPayload(row.parsed);
    const key = await lineKey(input.tx, row.targetId);
    if (values === null || key === null) continue;
    input.found.set(key, values);
  }
}

async function lineKey(tx: UnitOfWorkStores, targetId: string | null): Promise<string | null> {
  if (targetId === null) return null;
  const line = await tx.orderLines.find(targetId);
  if (line?.lane !== 'finished') return null;
  const key = line.candidateKey;
  if (key === null || key === undefined || key === '') return null;
  return key;
}

function byCommitOrder(left: ImportBatch, right: ImportBatch): number {
  const byTime = timeOf(left).localeCompare(timeOf(right));
  if (byTime !== 0) return byTime;
  return left.id.localeCompare(right.id);
}

function timeOf(batch: ImportBatch): string {
  return batch.committedAt ?? batch.updatedAt;
}

function poPayload(value: unknown): PoMasterPayload | null {
  if (!isPoMasterPayload(value)) return null;
  return value;
}

function isPoMasterPayload(value: unknown): value is PoMasterPayload {
  if (!isRecord(value)) return false;
  return isCell(value.po) && isCell(value.barcodeRaw) && isCell(value.nameRaw) && isCell(value.qtyOrdered);
}

function isCell(value: unknown): boolean {
  return isRecord(value) && 'raw' in value && 'value' in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
