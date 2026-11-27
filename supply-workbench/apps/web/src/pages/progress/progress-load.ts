import { type OrderLineRow, type ProcurementStore, type TodayResponse, type TodoItemView } from '@sw/contracts';
import { fetchLatestNotes } from '../../shared/api/catalog.js';
import { failureText, read, readFailureOf } from '../../shared/api/reads.js';
import { NOTE_READ_ERROR, progressMaterialRisks, progressRows, risksForLine, type ProgressLine, type ProgressMaterialRisk, type ProgressNudge, type ProgressRow } from '../../features/progress/index.js';
import { progressActionSource } from './progress-action-source.js';
import { storeBatchFacts, type StoreBatchFacts } from './progress-batch-facts.js';

export type ProgressData = {
  readonly rows: readonly ProgressRow[];
  readonly lines: ReadonlyMap<string, OrderLineRow>;
  readonly batchFacts: ReadonlyMap<string, StoreBatchFacts>;
  readonly arrivalMemos: TodayResponse['arrivalMemos'];
  readonly actionNotice: string;
};

const PROGRESS_PAGE_SIZE = 200;

export function pagesFor(input: { readonly total: number; readonly pageSize: number }): readonly number[] {
  const count = Math.max(1, Math.ceil(input.total / input.pageSize));
  return Array.from({ length: count }, (_unused, index) => index + 1);
}

type ProgressLinesScope = { readonly store: ProcurementStore; readonly isMine: boolean; readonly signal?: AbortSignal };

export async function loadProgressLines(scope: ProgressLinesScope): Promise<readonly OrderLineRow[]> {
  const first = await readLinePage(1, scope);
  const pages = pagesFor({ total: first.page.total, pageSize: PROGRESS_PAGE_SIZE });
  const rest = await Promise.all(pages.slice(1).map((page) => readLinePage(page, scope)));
  return [...first.items, ...rest.flatMap((listed) => listed.items)];
}

function readLinePage(page: number, { store, isMine, signal }: ProgressLinesScope) {
  const params = new URLSearchParams({ lane: 'finished', store, page: String(page), pageSize: String(PROGRESS_PAGE_SIZE) });
  if (isMine) params.set('buyer', 'me');
  return read({ name: 'lines', query: params.toString(), ...(signal === undefined ? {} : { signal }) });
}

export async function loadProgress(
  input: { readonly store: ProcurementStore; readonly isMine: boolean; readonly current: number; readonly latest: () => number; readonly setData: (data: ProgressData) => void; readonly setNotes: (notes: Readonly<Record<string, string>>) => void; readonly setError: (message: string) => void },
) { const { current, latest, setData, setNotes, setError } = input;
  try {
    const [lines, today] = await Promise.all([loadProgressLines(input), read({ name: 'today', scope: 'all' })]);
    if (current !== latest()) return;
    const actions = await progressActionSource(today);
    if (current !== latest()) return;
    const byId = new Map(lines.map((line) => [line.id, line]));
    const risks = progressMaterialRisks(actions.items);
    const rows = progressRows({ lines: [...byId.values()].map((line) => toLine(line, risksForLine(line, risks))), nudges: actions.items.flatMap(toNudge) });
    const batchFacts = storeBatchFacts(lines, { items: actions.items, arrivalMemos: today.arrivalMemos });
    setData({ rows, lines: byId, batchFacts, arrivalMemos: today.arrivalMemos, actionNotice: actions.notice });
    const saved = await loadSavedNotes(rows);
    if (current !== latest()) return;
    setNotes(saved.notes);
    setError(saved.failed ? NOTE_READ_ERROR : '');
  } catch (caught) {
    if (current !== latest()) return;
    const failure = readFailureOf(caught);
    setError(failure === null ? '' : failureText(failure));
  }
}

const NOTES_BATCH_SIZE = 200;

export function noteBatches(lineIds: readonly string[]): readonly (readonly string[])[] {
  const batches: string[][] = [];
  for (let index = 0; index < lineIds.length; index += NOTES_BATCH_SIZE) {
    batches.push(lineIds.slice(index, index + NOTES_BATCH_SIZE));
  }
  return batches;
}

async function loadSavedNotes(rows: readonly ProgressRow[]): Promise<{ readonly notes: Record<string, string>; readonly failed: boolean }> {
  if (rows.length === 0) return { notes: {}, failed: false };
  try {
    const loaded = await Promise.all(noteBatches(rows.map((row) => row.lineId)).map(fetchLatestNotes));
    return { notes: Object.fromEntries(loaded.flatMap((item) => item.items).map((item) => [item.orderLineId, item.text])), failed: false };
  } catch {
    return { notes: {}, failed: true };
  }
}

function toLine(row: OrderLineRow, materialRisks: readonly ProgressMaterialRisk[]): ProgressLine {
  return {
    id: row.id,
    nameRaw: row.nameRaw,
    poRaw: row.po.poRaw,
    stage: row.stage,
    daysInStage: row.daysInStage,
    materialRisks,
    supplier: { displayName: row.supplier.displayName, rawName: row.supplier.rawName },
    nextDue: row.nextDue === null ? null : {
      dateBuyerConfirmed: row.nextDue.dateBuyerConfirmed,
      overdueDays: row.nextDue.overdueDays,
    },
  };
}


function toNudge(item: TodoItemView): ProgressNudge[] {
  const lineId = item.line?.id ?? item.refs.orderLineId;
  if (lineId === undefined) return [];
  return [{ lineId, severity: item.severity, reasons: item.reasons }];
}
