import {
  BATCH_STATUSES,
  LANES,
  STUCK_BUCKETS,
  STUCK_CAUSES,
  parseLocalDate,
  type BatchStatus,
  type Lane,
  type LocalDate,
  type StuckBucket,
  type StuckCause,
} from '@sw/domain';
import {
  DASHBOARD_PRESETS,
  periodFor,
  shanghaiToday,
  type DashboardPreset,
  type DateRange,
  type NamedPreset,
} from './period.js';

export { DASHBOARD_PRESETS, STUCK_BUCKETS, STUCK_CAUSES as BOTTLENECK_CAUSES };
export type { DashboardPreset, StuckBucket, StuckCause as BottleneckCause };

export const DASHBOARD_VIEWS = ['stuck', 'suppliers', 'buyers', 'project', 'meeting'] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export const DASHBOARD_LANES = ['all', 'finished', 'material'] as const;
export type DashboardLane = (typeof DASHBOARD_LANES)[number];

export type StuckFilters = {
  readonly stage: BatchStatus | null;
  readonly bucket: StuckBucket | null;
  readonly cause: StuckCause | null;
  readonly card: 'overdue' | null;
};

export type DashboardQuery = StuckFilters & {
  readonly preset: DashboardPreset;
  readonly from: LocalDate;
  readonly to: LocalDate;
  readonly lane: DashboardLane;
  readonly view: DashboardView;
  readonly page: number;
};

export type DashboardPatch = Partial<StuckFilters> & {
  readonly preset?: DashboardPreset;
  readonly from?: string;
  readonly to?: string;
  readonly lane?: DashboardLane;
  readonly view?: DashboardView;
  readonly page?: number;
};

type ListedView = Exclude<DashboardView, 'stuck'>;

type SparseUrl = StuckFilters & {
  readonly preset: DashboardPreset | null;
  readonly from: LocalDate | null;
  readonly to: LocalDate | null;
  readonly lane: Lane | null;
  readonly view: ListedView | null;
  readonly page: number;
};

export function dashboardQuery(search: string, now: Date): DashboardQuery {
  const url = readSparse(search);
  const preset = resolvedPreset(url);
  const range = resolvedRange({ url, preset, now });
  return {
    preset,
    from: range.from,
    to: range.to,
    lane: url.lane ?? 'all',
    view: url.view ?? 'stuck',
    stage: url.stage,
    bucket: url.bucket,
    cause: url.cause,
    card: url.card,
    page: url.page,
  };
}

export function dashboardSearch(input: {
  readonly current: string;
  readonly now: Date;
  readonly patch: DashboardPatch;
}): string {
  if (rejectsCustom(input.patch)) return input.current;
  return writeSparse(
    applyPatch({ url: readSparse(input.current), now: input.now, patch: input.patch }),
  );
}

function readSparse(search: string): SparseUrl {
  const params = new URLSearchParams(withoutQuestion(search));
  const from = readDate(params.get('from'));
  const to = readDate(params.get('to'));
  return {
    preset: readPreset({ raw: params.get('preset'), from, to }),
    from,
    to,
    lane: readMember(params.get('lane'), LANES),
    view: readView(params.get('view')),
    stage: readMember(params.get('stage'), BATCH_STATUSES),
    bucket: readMember(params.get('bucket'), STUCK_BUCKETS),
    cause: readMember(params.get('cause'), STUCK_CAUSES),
    card: readMember(params.get('card'), ['overdue']),
    page: readPage(params.get('page')),
  };
}

function withoutQuestion(search: string): string {
  if (search.startsWith('?')) return search.slice(1);
  return search;
}

function readPreset(input: {
  readonly raw: string | null;
  readonly from: LocalDate | null;
  readonly to: LocalDate | null;
}): DashboardPreset | null {
  const preset = readMember(input.raw, DASHBOARD_PRESETS);
  if (preset === 'custom' && (input.from === null || input.to === null)) return null;
  return preset;
}

function readView(raw: string | null): ListedView | null {
  const view = readMember(raw, DASHBOARD_VIEWS);
  return view === 'stuck' ? null : view;
}

function readMember<T extends string>(raw: string | null, members: readonly T[]): T | null {
  if (raw === null) return null;
  const found = members.find((member) => member === raw);
  if (found === undefined) return null;
  return found;
}

function readPage(raw: string | null): number {
  if (raw === null || !/^[1-9][0-9]*$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) ? page : 1;
}

function readDate(raw: string | null): LocalDate | null {
  if (raw === null) return null;
  const parsed = parseLocalDate(raw);
  if (!parsed.ok) return null;
  return parsed.value;
}

function resolvedPreset(url: SparseUrl): DashboardPreset {
  if (url.preset !== null && url.preset !== 'custom') return url.preset;
  if (url.from !== null && url.to !== null) return 'custom';
  return 'recent-month';
}

function resolvedRange(input: {
  readonly url: SparseUrl;
  readonly preset: DashboardPreset;
  readonly now: Date;
}): DateRange {
  if (input.url.from !== null && input.url.to !== null)
    return { from: input.url.from, to: input.url.to };
  return periodFor(namedPreset(input.preset), shanghaiToday(input.now));
}

function namedPreset(preset: DashboardPreset): NamedPreset {
  if (preset === 'custom') return 'recent-month';
  return preset;
}

function rejectsCustom(patch: DashboardPatch): boolean {
  return patch.preset === 'custom' && !isCompleteDatePair(patch.from, patch.to);
}

function isCompleteDatePair(from: string | undefined, to: string | undefined): boolean {
  return readDate(from ?? null) !== null && readDate(to ?? null) !== null;
}

function applyPatch(input: {
  readonly url: SparseUrl;
  readonly now: Date;
  readonly patch: DashboardPatch;
}): SparseUrl {
  const ranged = applyPreset(input);
  const filters = {
    lane: applyLane(ranged.lane, input.patch.lane),
    stage: applyOptional(ranged.stage, input.patch.stage),
    bucket: applyOptional(ranged.bucket, input.patch.bucket),
    cause: applyOptional(ranged.cause, input.patch.cause),
    card: applyOptional(ranged.card, input.patch.card),
  };
  const hasChanged = filters.lane !== ranged.lane || filters.stage !== ranged.stage ||
    filters.bucket !== ranged.bucket || filters.cause !== ranged.cause || filters.card !== ranged.card;
  return {
    ...ranged,
    ...filters,
    view: applyView(ranged.view, input.patch.view),
    page: hasChanged ? 1 : (input.patch.page ?? ranged.page),
  };
}

function applyPreset(input: {
  readonly url: SparseUrl;
  readonly now: Date;
  readonly patch: DashboardPatch;
}): SparseUrl {
  if (input.patch.preset === undefined) return input.url;
  if (input.patch.preset === 'custom') return customUrl(input.url, input.patch);
  return namedUrl({ url: input.url, preset: input.patch.preset, now: input.now });
}

function customUrl(url: SparseUrl, patch: DashboardPatch): SparseUrl {
  return {
    ...url,
    preset: 'custom',
    from: readDate(patch.from ?? null),
    to: readDate(patch.to ?? null),
  };
}

function namedUrl(input: {
  readonly url: SparseUrl;
  readonly preset: NamedPreset;
  readonly now: Date;
}): SparseUrl {
  const range = periodFor(input.preset, shanghaiToday(input.now));
  return { ...input.url, preset: input.preset, from: range.from, to: range.to };
}

function applyLane(current: Lane | null, patch: DashboardLane | undefined): Lane | null {
  if (patch === undefined) return current;
  if (patch === 'all') return null;
  return patch;
}

function applyView(
  current: ListedView | null,
  patch: DashboardView | undefined,
): ListedView | null {
  if (patch === undefined) return current;
  if (patch === 'stuck') return null;
  return patch;
}

function applyOptional<T>(current: T | null, patch: T | null | undefined): T | null {
  if (patch === undefined) return current;
  return patch;
}

function writeSparse(url: SparseUrl): string {
  const params = new URLSearchParams();
  if (url.preset !== null) params.append('preset', url.preset);
  if (url.from !== null && url.to !== null) {
    params.append('from', url.from);
    params.append('to', url.to);
  }
  if (url.lane !== null) params.append('lane', url.lane);
  if (url.view !== null) params.append('view', url.view);
  appendStuckFilters(params, url);
  return params.toString();
}

export function appendStuckFilters(params: URLSearchParams, input: StuckFilters & { readonly page: number }): void {
  if (input.stage !== null) params.append('stage', input.stage);
  if (input.bucket !== null) params.append('bucket', input.bucket);
  if (input.cause !== null) params.append('cause', input.cause);
  if (input.card !== null) params.append('card', input.card);
  if (input.page > 1) params.append('page', String(input.page));
}
