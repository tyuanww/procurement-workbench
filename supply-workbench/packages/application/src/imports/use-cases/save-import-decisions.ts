import type { SaveImportDecisions, SaveImportDecisionsDeps } from '../boundary.js';
import { canTransitionImport } from '@sw/domain';
import { parseOrderLineId } from '@sw/domain';
import type { ImportDecisions } from '../views.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { StateConflictError, ValidationFailedError } from '../../shared/errors.js';
import { revisionOf, saveImportRevision } from './revision.js';

export const makeSaveImportDecisions =
  (deps: SaveImportDecisionsDeps): SaveImportDecisions =>
  async (input, actor) => {
    authorize(actor, 'imports.write');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const before = await tx.imports.get(input.importBatchId);
      if (before.template === 'batch-confirmed-arrival-v1') throw new ValidationFailedError('请修正确认日表后重新上传');
      if (!canTransitionImport(before.status, 'decide')) throw new StateConflictError(before.status);
      const decisions = mergeDecisions({ before: before.decisions, patch: input.decisions });
      const after = { ...before, revision: revisionOf(before.revision) + 1, decisions, updatedAt: at };
      await saveImportRevision({ repo: tx.imports, next: after, expectedRevision: input.expectedRevision });
      const rows = await tx.imports.listRows(before.id);
      const resolutions = new Map(decisions.conflictResolutions.map((resolution) => [resolution.rowId, entityIdOf(resolution.targetOrderLineId)]));
      const skips = new Map(decisions.rowSkips.map((skip) => [skip.rowId, skip.reason]));
      for (const row of rows) {
        const reason = skips.get(row.id);
        if (reason !== undefined) {
          await tx.imports.saveRow({ ...row, action: 'skip', skipReason: reason });
          continue;
        }
        const targetOrderLineId = resolutions.get(row.id);
        if (targetOrderLineId === undefined) continue;
        await tx.imports.saveRow({
          ...row,
          action: targetOrderLineId === null ? 'create' : 'update',
          targetId: targetOrderLineId,
          skipReason: null,
        });
      }
      await tx.audit.record(auditOf({ action: 'import.decide', subject: after, ctx: { actor, at, before, after, entity: '导入批次' } }));
    });
    return { importBatchId: input.importBatchId };
  };

function entityIdOf(value: string | null) {
  if (value === null) return null;
  const parsed = parseOrderLineId(value);
  if (!parsed.ok) throw new Error('冲突目标订单行编号无效');
  return parsed.value;
}

/** 已保存的决定按 rowId 合并：本次输入的同 rowId 项覆盖旧项，本次空数组不清旧项。 */
function mergeDecisions(input: { readonly before: unknown; readonly patch: ImportDecisions }): ImportDecisions {
  const previous = decisionsOf(input.before);
  return {
    issueDecisions: { ...previous.issueDecisions, ...input.patch.issueDecisions },
    rowSkips: mergeByRowId(previous.rowSkips, input.patch.rowSkips),
    conflictResolutions: mergeByRowId(previous.conflictResolutions, input.patch.conflictResolutions),
  };
}

function mergeByRowId<T extends { readonly rowId: string }>(before: readonly T[], patch: readonly T[]): readonly T[] {
  if (patch.length === 0) return before;
  const merged = new Map(before.map((item) => [item.rowId, item] as const));
  for (const item of patch) merged.set(item.rowId, item);
  return [...merged.values()];
}

function decisionsOf(value: unknown): ImportDecisions {
  if (!isRecord(value)) return { issueDecisions: {}, rowSkips: [], conflictResolutions: [] };
  return {
    issueDecisions: issueDecisionsOf(value.issueDecisions),
    rowSkips: skipsOf(value.rowSkips),
    conflictResolutions: resolutionsOf(value.conflictResolutions),
  };
}

function issueDecisionsOf(value: unknown): ImportDecisions['issueDecisions'] {
  if (!isRecord(value)) return {};
  if (value.DATE_NO_YEAR === 'fill_file_year' || value.DATE_NO_YEAR === 'keep_null') return { DATE_NO_YEAR: value.DATE_NO_YEAR };
  return {};
}

function skipsOf(value: unknown): ImportDecisions['rowSkips'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (isRecord(item) && typeof item.rowId === 'string' && typeof item.reason === 'string' ? [{ rowId: item.rowId, reason: item.reason }] : []));
}

function resolutionsOf(value: unknown): ImportDecisions['conflictResolutions'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.rowId !== 'string') return [];
    const target = item.targetOrderLineId;
    if (target !== null && typeof target !== 'string') return [];
    return [{ rowId: item.rowId, targetOrderLineId: target }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
