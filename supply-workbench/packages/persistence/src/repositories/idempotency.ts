import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { AppDatabase } from '../client.js';
import { commandIdempotency } from '../schema/platform.js';

export type DurableMutationResult = { readonly importBatchId: string };
export type DurableMutationClaim =
  | { readonly kind: 'claimed'; readonly id: string }
  | { readonly kind: 'replay'; readonly result: DurableMutationResult }
  | { readonly kind: 'busy' }
  | { readonly kind: 'payload_conflict' };

export async function claimCommand(input: { readonly db: AppDatabase; readonly actorId: string; readonly route: string; readonly resourceId: string; readonly key: string; readonly payload: unknown; readonly at: string }): Promise<DurableMutationClaim> {
  const payloadHash = hashPayload(input.payload);
  const id = hashPayload(`${input.actorId}\u0000${input.route}\u0000${input.resourceId}\u0000${input.key}`);
  const inserted = await input.db.insert(commandIdempotency).values({
    id,
    actorId: input.actorId,
    route: input.route,
    resourceId: input.resourceId,
    idempotencyKey: input.key,
    payloadHash,
    result: null,
    claimedAt: input.at,
    completedAt: null,
  }).onConflictDoNothing().returning();
  if (inserted.length === 1) return { kind: 'claimed', id };
  const existing = (await input.db.select().from(commandIdempotency).where(eq(commandIdempotency.id, id)))[0];
  if (existing === undefined) return { kind: 'busy' };
  if (existing.payloadHash !== payloadHash) return { kind: 'payload_conflict' };
  const replay = mutationResultOf(existing.result);
  if (replay !== undefined) return { kind: 'replay', result: replay };
  if (isStaleClaim(existing.claimedAt, input.at)) {
    const reclaimed = await input.db.update(commandIdempotency)
      .set({ claimedAt: input.at, completedAt: null })
      .where(and(eq(commandIdempotency.id, id), eq(commandIdempotency.claimedAt, existing.claimedAt), eq(commandIdempotency.payloadHash, payloadHash)))
      .returning();
    if (reclaimed.length === 1) return { kind: 'claimed', id };
  }
  return { kind: 'busy' };
}

export async function completeCommand(input: { readonly db: AppDatabase; readonly id: string; readonly result: DurableMutationResult; readonly at: string }): Promise<void> {
  await input.db.update(commandIdempotency).set({ result: input.result, completedAt: input.at }).where(eq(commandIdempotency.id, input.id));
}

export async function releaseCommand(db: AppDatabase, id: string): Promise<void> {
  await db.delete(commandIdempotency).where(eq(commandIdempotency.id, id));
}

function hashPayload(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value) ?? 'undefined';
  return createHash('sha256').update(serialized).digest('hex');
}

function mutationResultOf(value: unknown): DurableMutationResult | undefined {
  if (typeof value !== 'object' || value === null || !('importBatchId' in value) || typeof value.importBatchId !== 'string') return undefined;
  return { importBatchId: value.importBatchId };
}

function isStaleClaim(claimedAt: string, now: string): boolean {
  const claimed = Date.parse(claimedAt);
  const current = Date.parse(now);
  return Number.isFinite(claimed) && Number.isFinite(current) && current - claimed > 15 * 60 * 1000;
}
