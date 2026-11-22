import { UNLINKED_PROCUREMENT } from '@sw/domain';
import { procurementSourceFact, procurementSourceKey } from '../../shared/procurement-source.js';
import type { ImportQueries } from '../../ports/import-queries.js';
import type { ProcurementPreview, ProcurementPreviewSelection, ProcurementSubmission } from '../../ports/procurement-preview.js';
import type { Actor } from '../../shared/actor.js';
import { authorize } from '../../shared/authorize.js';

const NO_OA = '';
type FinishedRow = ProcurementPreview['finishedRows'][number];

export const makeGetProcurementPreview = (deps: { readonly imports: ImportQueries }) =>
  async (input: { readonly importBatchId: string; readonly oa?: string | undefined }, actor: Actor): Promise<ProcurementPreviewSelection | null> => {
    authorize(actor, 'imports.write');
    const submission = await deps.imports.getProcurementSubmission?.(input.importBatchId);
    const preview = await deps.imports.getProcurementPreview(submission?.originalBatchId ?? input.importBatchId);
    if (preview === null) return null;
    return selectPreview({ preview, requested: input.oa, submission });
  };

function selectPreview({ preview, requested, submission }: {
  readonly preview: ProcurementPreview;
  readonly requested: string | undefined;
  readonly submission: ProcurementSubmission | undefined;
}): ProcurementPreviewSelection {
  const grouped = groupedFinishedRows(preview.finishedRows);
  const groups = [...grouped].map(([oa, rows]) => ({ oa, count: rows.length }));
  const unlinked = submission === undefined ? [] : unlinkedFacts(preview);
  if (unlinked.length > 0) groups.push({ oa: UNLINKED_PROCUREMENT, count: unlinked.length });
  const oa = requested ?? defaultSelection(groups);
  const finishedRows = grouped.get(oa) ?? [];
  const finished = new Set(finishedRows.map((row) => procurementSourceKey(row.source)));
  const links = preview.links.filter((link) => finished.has(procurementSourceKey(link.finishedRow)));
  const components = new Set(links.map((link) => procurementSourceKey(link.component)));
  const componentFacts = oa === UNLINKED_PROCUREMENT ? unlinked : preview.componentFacts.filter((fact) => components.has(procurementSourceKey(fact.source)));
  const selected = { oa, groups, finishedRows, links, componentFacts: componentFacts.map(procurementSourceFact) };
  if (submission === undefined) return selected;
  for (const fact of componentFacts) components.add(procurementSourceKey(fact.source));
  return { ...selected, submission: {
    originalBatchId: submission.originalBatchId,
    finished: submission.finished.filter((row) => finished.has(procurementSourceKey(row))),
    observations: submission.observations.filter((row) => components.has(procurementSourceKey(row))),
  } };
}


function groupedFinishedRows(rows: readonly FinishedRow[]): ReadonlyMap<string, FinishedRow[]> {
  const grouped = new Map<string, FinishedRow[]>();
  for (const row of rows) {
    const refs = new Set(row.oaRefs.map((ref) => ref.main));
    if (refs.size === 0) refs.add(NO_OA);
    for (const ref of refs) {
      const group = grouped.get(ref) ?? [];
      group.push(row);
      grouped.set(ref, group);
    }
  }
  return grouped;
}

function unlinkedFacts(preview: ProcurementPreview): ProcurementPreview['componentFacts'] {
  const linked = new Set(preview.links.map((link) => procurementSourceKey(link.component)));
  return preview.componentFacts.filter((fact) => !linked.has(procurementSourceKey(fact.source)));
}

function defaultSelection(groups: ProcurementPreviewSelection['groups']): string {
  return groups.find((group) => group.oa !== NO_OA && group.oa !== UNLINKED_PROCUREMENT)?.oa ?? groups[0]?.oa ?? NO_OA;
}
