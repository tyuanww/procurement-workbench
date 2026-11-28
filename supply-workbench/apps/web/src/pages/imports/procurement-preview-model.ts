import { recognizedPoNumbers } from '@sw/domain';
import { UNLINKED_PROCUREMENT, type ProcurementPreviewSelection } from '@sw/contracts';
import { isBatchImportSource } from '../../features/imports/index.js';
import { importSourceQuery, previewPage, type ImportSourceState } from './import-source.js';

export const sourcePageSizes = { finished: 12, component: 16, candidate: 16 } as const;
export type SourceTable = keyof typeof sourcePageSizes;

export function sourcePagination({ source, table }: { readonly source: ImportSourceState; readonly table: SourceTable }) {
  const key = importSourceQuery[table];
  return {
    pageSize: sourcePageSizes[table], current: previewPage(source.params, key), hideOnSinglePage: true, showSizeChanger: false,
    onChange: (page: number) => source.update({ [key]: page === 1 ? null : String(page) }, true),
  };
}

export function rowSourceInOa(source: ImportSourceState, oa: string): ImportSourceState {
  return { ...source, open: (key) => source.open(key, { [importSourceQuery.oa]: oa === '' ? '~' : oa }) };
}

export function switchPreviewOa(source: ImportSourceState, oa: string) {
  const rowSource = source.sourceKey !== null && !isBatchImportSource(source.sourceKey) ? { drawer: null, source: null } : undefined;
  source.update({
    [importSourceQuery.oa]: oa === '' ? '~' : oa, [importSourceQuery.finished]: null,
    [importSourceQuery.component]: null, [importSourceQuery.candidate]: null, candidates: null, ...rowSource,
  });
}

export function sourcePagePatch({ params, selected, isUnlinked }: {
  readonly params: URLSearchParams; readonly selected: { readonly table: SourceTable; readonly page: number } | null; readonly isUnlinked: boolean;
}) {
  if (selected === null) return null;
  const key = importSourceQuery[selected.table];
  const isWrongPage = previewPage(params, key) !== selected.page;
  const isCollapsed = selected.table === 'candidate' && !isUnlinked && !params.has('candidates');
  if (!isWrongPage && !isCollapsed) return null;
  return {
    ...(isWrongPage ? { [key]: selected.page === 1 ? null : String(selected.page) } : {}),
    ...(isCollapsed ? { candidates: '1' } : {}),
  };
}

type FinishedRow = ProcurementPreviewSelection['finishedRows'][number];
type ComponentFact = ProcurementPreviewSelection['componentFacts'][number];
type LinkKind = ProcurementPreviewSelection['links'][number]['kind'];
type Source = FinishedRow['source'];
type Observation = NonNullable<ProcurementPreviewSelection['submission']>['observations'][number];

export type ComponentRow = {
  readonly fact: ComponentFact;
  readonly observation?: Observation;
  readonly matches: readonly { readonly row: FinishedRow; readonly kind: LinkKind }[];
};

export type FinishedSummary = FinishedRow & { readonly statuses: readonly ComponentFact['status'][]; readonly orderLineId?: string };
type VisibleProcurement = {
  readonly rows: readonly FinishedSummary[];
  readonly poCount: number;
  readonly related: readonly ComponentRow[];
  readonly candidates: readonly ComponentRow[];
};

export function visibleProcurement(preview: ProcurementPreviewSelection): VisibleProcurement {
  const committedFinished = new Map(preview.submission?.finished.map((row) => [sourceKey(row), row.orderLineId]));
  const observations = new Map(preview.submission?.observations.map((row) => [sourceKey(row), row]));
  const { related, candidates, statuses } = groupMatches(preview, observations);
  const pending = preview.oa === UNLINKED_PROCUREMENT
    ? preview.componentFacts.map((fact) => componentRow({ fact, observation: observations.get(sourceKey(fact.source)), matches: [] }))
    : [...candidates.values()];
  return {
    rows: preview.finishedRows.map((row) => {
      const key = sourceKey(row.source);
      const orderLineId = committedFinished.get(key);
      return { ...row, ...(orderLineId === undefined ? {} : { orderLineId }), statuses: [...(statuses.get(key) ?? [])] };
    }),
    poCount: new Set(preview.finishedRows.flatMap((row) => row.poRaw === null ? [] : recognizedPoNumbers(row.poRaw))).size,
    related: [...related.values()],
    candidates: pending,
  };
}

function groupMatches(preview: ProcurementPreviewSelection, observations: ReadonlyMap<string, Observation>) {
  const finishedBySource = new Map(preview.finishedRows.map((row) => [sourceKey(row.source), row]));
  const statuses = new Map<string, Set<ComponentFact['status']>>();
  const related = new Map<string, ComponentRow>();
  const candidates = new Map<string, ComponentRow>();
  const factsBySource = new Map(preview.componentFacts.map((fact) => [sourceKey(fact.source), fact]));
  for (const link of preview.links) {
    const finishedKey = sourceKey(link.finishedRow);
    const componentKey = sourceKey(link.component);
    const row = finishedBySource.get(finishedKey);
    const fact = factsBySource.get(componentKey);
    if (row === undefined || fact === undefined) continue;
    const destination = link.kind === 'candidate' || link.kind === 'group' ? candidates : related;
    const item = destination.get(componentKey);
    const observation = observations.get(componentKey);
    destination.set(componentKey, componentRow({ fact, observation, matches: [...(item?.matches ?? []), { row, kind: link.kind }] }));
    if (link.kind === 'candidate') continue;
    const evidence = statuses.get(finishedKey) ?? new Set<ComponentFact['status']>();
    evidence.add(fact.status);
    statuses.set(finishedKey, evidence);
  }
  return { related, candidates, statuses };
}

function componentRow({ fact, observation, matches }: { readonly fact: ComponentFact; readonly observation: Observation | undefined; readonly matches: ComponentRow['matches'] }): ComponentRow {
  return { fact, matches, ...(observation === undefined ? {} : { observation }) };
}

export function sourceKey(source: Source) {
  return `${source.sheetName}:${source.rowNo}`;
}
