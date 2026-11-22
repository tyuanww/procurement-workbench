import type { DiscardImport, DiscardImportDeps } from '../boundary.js';
import { canTransitionImport } from '@sw/domain';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { StateConflictError } from '../../shared/errors.js';
import { revisionOf, saveImportRevision } from './revision.js';

export const makeDiscardImport =
  (deps: DiscardImportDeps): DiscardImport =>
  async (input, actor) => {
    authorize(actor, 'imports.write');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const before = await tx.imports.get(input.importBatchId);
      if (!canTransitionImport(before.status, 'discard')) throw new StateConflictError(before.status);
      const after = { ...before, revision: revisionOf(before.revision) + 1, status: 'discarded' as const, updatedAt: at };
      await saveImportRevision({ repo: tx.imports, next: after, expectedRevision: input.expectedRevision });
      await tx.audit.record(auditOf({ action: 'import.discard', subject: after, ctx: { actor, at, before, after, entity: '导入批次' } }));
    });
    return { importBatchId: input.importBatchId };
  };
