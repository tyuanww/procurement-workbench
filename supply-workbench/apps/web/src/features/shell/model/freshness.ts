import type { TemplateId } from '@sw/domain';
import { businessTimeZone } from '../../../shared/business-time-zone.js';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const MISSING = '—';

export type SourceFact = {
  readonly template: TemplateId;
  readonly factoryPartyId: string | null;
  readonly label: string;
  readonly lastCommittedAt: string | null;
  readonly fileModifiedAt: string | null;
};

export type FreshnessFacts =
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly sources: readonly SourceFact[] };

export type FreshnessChip = {
  readonly key: string;
  readonly text: string;
  readonly tooltip: string;
  readonly status: FreshnessStatus;
  readonly isStale: boolean;
};

export type FreshnessStatus = 'fresh' | 'stale' | 'unknown';

export function freshnessView(input: { readonly facts: FreshnessFacts; readonly now: string; readonly timeZone?: string }): {
  readonly headline: string;
  readonly chips: readonly FreshnessChip[];
} {
  if (input.facts.kind === 'pending') return { headline: '数据', chips: [] };
  if (input.facts.kind !== 'ready') return { headline: '数据：—', chips: [] };
  if (input.facts.sources.length === 0) return { headline: '数据：—', chips: [] };
  return {
    headline: '数据',
    chips: input.facts.sources.map((source) => chipOf({ source, now: input.now, timeZone: input.timeZone ?? businessTimeZone() })),
  };
}

function chipOf(input: { readonly source: SourceFact; readonly now: string; readonly timeZone: string }): FreshnessChip {
  const party = input.source.factoryPartyId ?? '';
  const nowYear = yearOf(input.now, input.timeZone);
  const status = freshnessStatus({ source: input.source, now: input.now });
  return {
    key: `${input.source.template}:${party}`,
    text: clockText({ source: input.source, nowYear, withYear: false, timeZone: input.timeZone }),
    tooltip: clockText({ source: input.source, nowYear, withYear: true, timeZone: input.timeZone }),
    status,
    isStale: status === 'stale',
  };
}

function clockText(input: {
  readonly source: SourceFact;
  readonly nowYear: string | null;
  readonly withYear: boolean;
  readonly timeZone: string;
}): string {
  const imported = formatInstant({
    iso: input.source.lastCommittedAt,
    nowYear: input.nowYear,
    withYear: input.withYear,
    timeZone: input.timeZone,
  });
  if (input.source.template !== 'factory-progress-v1') return `${input.source.label} ${imported}`;
  const fileTime = formatInstant({
    iso: input.source.fileModifiedAt,
    nowYear: input.nowYear,
    withYear: input.withYear,
    timeZone: input.timeZone,
  });
  return `${input.source.label} ${imported} 文件时间 ${fileTime}`;
}

function freshnessStatus(input: { readonly source: SourceFact; readonly now: string }): FreshnessStatus {
  const committed = parseInstant(input.source.lastCommittedAt);
  const current = Date.parse(input.now);
  if (committed === null || !Number.isFinite(current)) return 'unknown';
  const file = input.source.template === 'factory-progress-v1' ? parseInstant(input.source.fileModifiedAt) : null;
  if (input.source.template === 'factory-progress-v1' && file === null) return 'unknown';
  const threshold = current - STALE_MS;
  if (committed < threshold || (file !== null && file < threshold)) return 'stale';
  return 'fresh';
}

function parseInstant(iso: string | null): number | null {
  if (iso === null) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatInstant(input: {
  readonly iso: string | null;
  readonly nowYear: string | null;
  readonly withYear: boolean;
  readonly timeZone: string;
}): string {
  if (input.iso === null) return MISSING;
  const parsed = Date.parse(input.iso);
  if (!Number.isFinite(parsed)) return MISSING;
  const parts = clockParts(new Date(parsed), input.timeZone);
  if (parts === null) return MISSING;
  const shouldShowYear = input.withYear || input.nowYear === null || parts.year !== input.nowYear;
  if (!shouldShowYear) return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function yearOf(iso: string, timeZone: string): string | null {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  const parts = clockParts(new Date(parsed), timeZone);
  return parts === null ? null : parts.year;
}

function clockParts(instant: Date, timeZone: string): ClockParts | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const year = clockPart({ parts, type: 'year' });
  const month = clockPart({ parts, type: 'month' });
  const day = clockPart({ parts, type: 'day' });
  const hour = clockPart({ parts, type: 'hour' });
  const minute = clockPart({ parts, type: 'minute' });
  if (year === MISSING || month === MISSING || day === MISSING || hour === MISSING || minute === MISSING) return null;
  return { year, month, day, hour, minute };
}

function clockPart(input: {
  readonly parts: readonly Intl.DateTimeFormatPart[];
  readonly type: Intl.DateTimeFormatPartTypes;
}): string {
  const found = input.parts.find((item) => item.type === input.type);
  return found === undefined ? MISSING : found.value;
}

type ClockParts = {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly hour: string;
  readonly minute: string;
};
