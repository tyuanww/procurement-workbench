import { StateConflictError } from '../../shared/errors.js';

export type ImportMutationResult = { readonly importBatchId: string };

export type ImportMutationClaim =
  | { readonly kind: 'claimed'; readonly id: string }
  | { readonly kind: 'replay'; readonly result: ImportMutationResult }
  | { readonly kind: 'busy' }
  | { readonly kind: 'payload_conflict' };

export type ImportMutation = {
  readonly route: string;
  readonly resourceId: string;
  readonly actorId: string;
  readonly key?: string | undefined;
  readonly payload: unknown;
  readonly run: () => Promise<ImportMutationResult>;
};

type IdempotencyPort = {
  readonly claim: (input: { readonly actorId: string; readonly route: string; readonly resourceId: string; readonly key: string; readonly payload: unknown }) => Promise<ImportMutationClaim>;
  readonly complete: (input: { readonly id: string; readonly result: ImportMutationResult }) => Promise<void>;
  readonly release: (id: string) => Promise<void>;
};

export function makeIdempotentImportCommand(port: IdempotencyPort) {
  return (command: ImportMutation) => runImportMutation(port, command);
}

async function runImportMutation(port: IdempotencyPort, command: ImportMutation): Promise<ImportMutationResult> {
  const key = command.key;
  if (key === undefined || key.trim() === '') return command.run();
  const claim = await port.claim({ actorId: command.actorId, route: command.route, resourceId: command.resourceId, key, payload: command.payload });
  if (claim.kind === 'replay') return claim.result;
  if (claim.kind === 'payload_conflict') throw new StateConflictError('idempotency payload');
  if (claim.kind === 'busy') throw new StateConflictError('idempotency in progress');
  return finishClaim(port, { id: claim.id, run: command.run });
}

async function finishClaim(port: IdempotencyPort, claimed: { readonly id: string; readonly run: () => Promise<ImportMutationResult> }): Promise<ImportMutationResult> {
  try {
    const result = await claimed.run();
    await port.complete({ id: claimed.id, result });
    return result;
  } catch (error) {
    await port.release(claimed.id);
    throw error;
  }
}
