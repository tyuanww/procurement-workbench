import { IMPORT_STALE_DAYS, localDate, diffDays } from '@sw/domain';
import type { DiscardStaleImports, DiscardStaleImportsDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { revisionOf, saveImportRevision } from './revision.js';

export const makeDiscardStaleImports =
  (deps: DiscardStaleImportsDeps): DiscardStaleImports =>
  async (_input, actor) => {
    authorize(actor, 'imports.write');
    const at = deps.clock.now();
    const today = deps.clock.today();
    let discarded = 0;
    await deps.uow.run(async (tx) => {
      for (const batch of await tx.imports.list()) {
        if (batch.status !== 'parsed' || !isStale(batch.createdAt, today)) continue;
        const after = { ...batch, revision: revisionOf(batch.revision) + 1, status: 'discarded' as const, updatedAt: at };
        await saveImportRevision({ repo: tx.imports, next: after, expectedRevision: revisionOf(batch.revision) });
        await tx.audit.record(auditOf({ action: 'import.discard-stale', subject: after, ctx: { actor, at, entity: '导入批次' } }));
        discarded += 1;
      }
    });
    return { discarded };
  };

const ISO_DATE_LENGTH = 10;

function isStale(createdAt: string, today: ReturnType<typeof localDate>): boolean {
  return diffDays(today, localDate(createdAt.slice(0, ISO_DATE_LENGTH))) >= IMPORT_STALE_DAYS;
}
