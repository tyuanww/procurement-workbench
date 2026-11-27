import type { LineSummary, LineTimeline, MeResponse, OrderLineDetail, ProcurementStore, ProjectProgress, TodayPageResponse, TodayResponse } from '@sw/contracts';
import {
  fetchLine,
  lineReadPath,
  fetchLineTimeline,
  fetchLines,
  fetchLinesSummary,
  fetchMe,
  fetchPlanDaily,
  fetchPlanProgress,
  fetchPlanSchedule,
  planSchedulePath,
  fetchPlanWorkItem,
  fetchToday,
  fetchTodayPage,
  type LinesPage,
  type PlanDaily,
  type PlanSchedule,
  type PlanWorkItem,
} from './catalog.js';
import { readFailureOf, type ReadFailure } from './failure.js';
import { abortFlights, joinFlight, readLifetimeSignal, type Shared } from './flights.js';
import {
  emptySlots,
  generationOf,
  todayGenerationOf,
  peekMe,
  peekToday,
  storeMe,
  storeToday,
  subscribeToday,
  type ClearNotice,
  type TodayScope,
} from './slots.js';

export { failureText, readFailureOf, ReadError, type ReadFailure } from './failure.js';
export { emptyReads };

export type ReadRequest =
  | { readonly name: 'me'; readonly signal?: AbortSignal }
  | ({ readonly name: 'today' } & TodayRead)
  | { readonly name: 'lines'; readonly query: string; readonly signal?: AbortSignal }
  | { readonly name: 'linesSummary'; readonly query: string; readonly signal?: AbortSignal }
  | LineRead
  | { readonly name: 'lineTimeline'; readonly id: string; readonly signal?: AbortSignal }
  | { readonly name: 'planDaily'; readonly date: string; readonly signal?: AbortSignal }
  | ScheduleRead
  | { readonly name: 'planProgress'; readonly from: string; readonly to: string; readonly signal?: AbortSignal }
  | { readonly name: 'planWorkItem'; readonly id: string; readonly signal?: AbortSignal };

type LineRead = { readonly name: 'line'; readonly id: string; readonly store?: ProcurementStore; readonly signal?: AbortSignal };

type TodayRead = { readonly scope: TodayScope; readonly includePending?: boolean; readonly signal?: AbortSignal };

type ScheduleRead = Parameters<typeof planSchedulePath>[0] & { readonly name: 'planSchedule'; readonly signal?: AbortSignal };

type ReadBody =
  | MeResponse
  | TodayResponse
  | LinesPage
  | LineSummary
  | OrderLineDetail
  | LineTimeline
  | PlanDaily
  | PlanSchedule
  | ProjectProgress
  | PlanWorkItem;

export type ReadView<T> =
  | { readonly status: 'loading'; readonly previous: T | null }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly failure: ReadFailure; readonly previous: T | null };

const meTable = new Map<string, Shared<MeResponse>>();
const todayTable = new Map<string, Shared<TodayResponse>>();
const todayPagesTable = new Map<string, Shared<TodayPageResponse>>();
const linesTable = new Map<string, Shared<LinesPage>>();
const summaryTable = new Map<string, Shared<LineSummary>>();
const lineTable = new Map<string, Shared<OrderLineDetail>>();
const timelineTable = new Map<string, Shared<LineTimeline>>();
const dailyTable = new Map<string, Shared<PlanDaily>>();
const scheduleTable = new Map<string, Shared<PlanSchedule>>();
const progressTable = new Map<string, Shared<ProjectProgress>>();
const workItemTable = new Map<string, Shared<PlanWorkItem>>();

export function read(input: { readonly name: 'me'; readonly signal?: AbortSignal }): Promise<MeResponse>;
export function read(input: { readonly name: 'today' } & TodayRead): Promise<TodayResponse>;
export function read(input: { readonly name: 'lines'; readonly query: string; readonly signal?: AbortSignal }): Promise<LinesPage>;
export function read(input: { readonly name: 'linesSummary'; readonly query: string; readonly signal?: AbortSignal }): Promise<LineSummary>;
export function read(input: LineRead): Promise<OrderLineDetail>;
export function read(input: { readonly name: 'lineTimeline'; readonly id: string; readonly signal?: AbortSignal }): Promise<LineTimeline>;
export function read(input: { readonly name: 'planDaily'; readonly date: string; readonly signal?: AbortSignal }): Promise<PlanDaily>;
export function read(input: ScheduleRead): Promise<PlanSchedule>;
export function read(input: { readonly name: 'planProgress'; readonly from: string; readonly to: string; readonly signal?: AbortSignal }): Promise<ProjectProgress>;
export function read(input: { readonly name: 'planWorkItem'; readonly id: string; readonly signal?: AbortSignal }): Promise<PlanWorkItem>;
export async function read(input: ReadRequest): Promise<ReadBody> {
  if (input.name === 'me') return readMe(input.signal);
  if (input.name === 'today') return readToday(input);
  return readCatalog(input);
}

async function readCatalog(input: Exclude<ReadRequest, { readonly name: 'me' | 'today' }>): Promise<ReadBody> {
  switch (input.name) {
    case 'lines':
      return readLines(input);
    case 'linesSummary':
      return readSummary(input);
    case 'line':
      return readLine(input);
    case 'lineTimeline':
      return readTimeline(input);
    case 'planDaily':
      return readDaily(input);
    case 'planSchedule':
      return readSchedule(input);
    case 'planProgress':
      return readProgress(input);
    case 'planWorkItem':
      return readWorkItem(input);
  }
}

export function listenToday(input: {
  readonly scope: TodayScope;
  readonly onChange: (view: ReadView<TodayResponse>) => void;
}): () => void {
  const stop = subscribeToday(input.scope, {
    onValue: (value) => input.onChange({ status: 'ready', value }),
    onClear: (notice) => { refillToday({ scope: input.scope, notice, onChange: input.onChange }); },
  });
  void deliverToday(input.scope, input.onChange);
  return stop;
}

export function readTodayPage({ query, scope }: { readonly query: string; readonly scope: TodayScope }): Promise<TodayPageResponse> {
  return joinFlight({
    table: todayPagesTable,
    key: `/api/v1/today?${query}`,
    signal: undefined,
    isRetained: false,
    currentGeneration: () => todayGenerationOf(scope),
    load: (signal) => fetchTodayPage(query, signal),
  });
}

function emptyReads(): void {
  emptySlots();
  abortFlights();
  meTable.clear();
  todayTable.clear();
  todayPagesTable.clear();
  linesTable.clear();
  summaryTable.clear();
  lineTable.clear();
  timelineTable.clear();
  dailyTable.clear();
  scheduleTable.clear();
  progressTable.clear();
  workItemTable.clear();
}

function readMe(signal: AbortSignal | undefined): Promise<MeResponse> {
  return readHeld({
    peek: peekMe,
    currentGeneration: () => generationOf('me'),
    key: '/api/v1/me',
    table: meTable,
    signal,
    load: fetchMe,
    store: storeMe,
  });
}

function readToday({ scope, includePending, signal }: TodayRead): Promise<TodayResponse> {
  const slot = includePending === true ? `${scope}-pending` as const : scope;
  const path = `/api/v1/today?scope=${scope}${includePending === true ? '&includePending=true' : ''}`;
  return readHeld({
    peek: () => peekToday(slot),
    currentGeneration: () => todayGenerationOf(slot),
    key: path,
    table: todayTable,
    signal,
    load: (flightSignal) => fetchToday(path, flightSignal),
    store: (value) => storeToday(slot, value),
  });
}

async function readHeld<T>(input: {
  readonly peek: () => T | null;
  readonly currentGeneration: () => number;
  readonly key: string;
  readonly table: Map<string, Shared<T>>;
  readonly signal: AbortSignal | undefined;
  readonly load: (signal: AbortSignal) => Promise<T>;
  readonly store: (value: T) => void;
}): Promise<T> {
  const lifetime = readLifetimeSignal();
  for (;;) {
    lifetime.throwIfAborted();
    const stored = input.peek();
    if (stored !== null) return stored;
    const generation = input.currentGeneration();
    try {
      const value = await joinFlight({
        table: input.table,
        key: input.key,
        currentGeneration: input.currentGeneration,
        isRetained: true,
        signal: input.signal,
        load: input.load,
        keep: (next) => { if (input.currentGeneration() === generation) input.store(next); },
      });
      if (input.currentGeneration() === generation) return value;
    } catch (error) {
      if (input.currentGeneration() === generation) throw error;
    }
  }
}

function readLines(input: { readonly query: string; readonly signal?: AbortSignal }): Promise<LinesPage> {
  return readVolatile({ table: linesTable, key: `/api/v1/lines?${input.query}`, family: 'lines', signal: input.signal, load: (signal) => fetchLines(input.query, signal) });
}

function readSummary(input: { readonly query: string; readonly signal?: AbortSignal }): Promise<LineSummary> {
  return readVolatile({ table: summaryTable, key: `/api/v1/lines/summary?${input.query}`, family: 'lines', signal: input.signal, load: (signal) => fetchLinesSummary(input.query, signal) });
}

function readLine(input: LineRead): Promise<OrderLineDetail> {
  return readVolatile({ table: lineTable, key: lineReadPath(input), family: 'lines', signal: input.signal, load: (signal) => fetchLine({ ...input, signal }) });
}

function readTimeline(input: { readonly id: string; readonly signal?: AbortSignal }): Promise<LineTimeline> {
  return readVolatile({ table: timelineTable, key: `/api/v1/lines/${input.id}/timeline`, family: 'lines', signal: input.signal, load: (signal) => fetchLineTimeline(input.id, signal) });
}

function readDaily(input: { readonly date: string; readonly signal?: AbortSignal }): Promise<PlanDaily> {
  return readVolatile({ table: dailyTable, key: `/api/v1/plan/daily?date=${input.date}`, family: 'plan', signal: input.signal, load: (signal) => fetchPlanDaily(input.date, signal) });
}

function readSchedule(input: ScheduleRead): Promise<PlanSchedule> {
  return readVolatile({ table: scheduleTable, key: planSchedulePath(input), family: 'plan', signal: input.signal, load: (signal) => fetchPlanSchedule({ ...input, signal }) });
}

function readProgress(input: { readonly from: string; readonly to: string; readonly signal?: AbortSignal }): Promise<ProjectProgress> {
  const key = `/api/v1/plan/progress?from=${input.from}&to=${input.to}`;
  return readVolatile({ table: progressTable, key, family: 'plan', signal: input.signal, load: (signal) => fetchPlanProgress({ from: input.from, to: input.to, signal }) });
}

function readWorkItem(input: { readonly id: string; readonly signal?: AbortSignal }): Promise<PlanWorkItem> {
  return readVolatile({ table: workItemTable, key: `/api/v1/plan/work-items/${input.id}`, family: 'plan', signal: input.signal, load: (signal) => fetchPlanWorkItem(input.id, signal) });
}

function readVolatile<T>(input: {
  readonly table: Map<string, Shared<T>>;
  readonly key: string;
  readonly family: 'lines' | 'plan';
  readonly signal: AbortSignal | undefined;
  readonly load: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  return joinFlight({ ...input, isRetained: false, currentGeneration: () => generationOf(input.family) });
}

function refillToday(input: {
  readonly scope: TodayScope;
  readonly notice: ClearNotice;
  readonly onChange: (view: ReadView<TodayResponse>) => void;
}): void {
  if (input.notice.isSilent) return;
  const previous = input.notice.previous === undefined ? peekToday(input.scope) : input.notice.previous;
  input.onChange({ status: 'loading', previous });
  void deliverToday(input.scope, input.onChange);
}

function deliverToday(scope: TodayScope, onChange: (view: ReadView<TodayResponse>) => void): void {
  void readToday({ scope }).then(
    (value) => onChange({ status: 'ready', value }),
    (error: unknown) => report({ error, previous: peekToday(scope), onChange }),
  );
}

function report<T>(input: {
  readonly error: unknown;
  readonly previous: T | null;
  readonly onChange: (view: ReadView<T>) => void;
}): void {
  const failure = readFailureOf(input.error);
  if (failure === null) return;
  input.onChange({ status: 'error', failure, previous: input.previous });
}
