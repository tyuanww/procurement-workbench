import type { LinesQuery } from '@sw/application';
import { LinesQuerySchema, ProcurementStoreSchema } from '@sw/contracts';
import { parse } from '../parse.js';
import { isRecord } from './records.js';

const PAGE_DEFAULT = 50;

export function detailStoreOf(query: unknown) {
  if (!isRecord(query) || query.store === undefined) return {};
  return { store: parse(ProcurementStoreSchema, query.store) };
}

export function listQueryOf(query: unknown, actorId: string): LinesQuery {
  const parsed = linesQueryOf(query, actorId);
  return { ...parsed, page: parsed.page ?? 1, pageSize: parsed.pageSize ?? PAGE_DEFAULT };
}

export function linesQueryOf(query: unknown, actorId: string): LinesQuery {
  const raw = isRecord(query) ? query : {};
  const parsed = parse(LinesQuerySchema, defined({
    lane: text(raw.lane),
    store: text(raw.store),
    q: text(raw.q),
    supplierPartyId: text(raw.supplierPartyId),
    factoryPartyId: text(raw.factoryPartyId),
    inTransitFactory: text(raw.inTransitFactory),
    receiverPartyId: text(raw.receiverPartyId),
    buyer: text(raw.buyer),
    stages: list(raw.stages),
    statusReported: list(raw.statusReported),
    overdueOnly: flag(raw.overdueOnly),
    hasOpenException: flag(raw.hasOpenException),
    missingInLatestImport: flag(raw.missingInLatestImport),
    confirmedFrom: text(raw.confirmedFrom),
    confirmedTo: text(raw.confirmedTo),
    importBatchId: text(raw.importBatchId),
    page: numberOf(raw.page),
    pageSize: numberOf(raw.pageSize),
    sort: text(raw.sort),
  }));
  const { buyer, ...rest } = parsed;
  const mapped = buyerOf(buyer, actorId);
  return mapped === undefined ? rest : { ...rest, buyer: mapped };
}

export function exportQueryOf(query: unknown, actorId: string): LinesQuery {
  return linesQueryOf(withoutPage(query), actorId);
}

export function exportRequestOf(query: unknown, actorId: string): { readonly query: LinesQuery; readonly hiddenKeys: readonly string[]; readonly columnKeys: readonly string[] } {
  return { query: exportQueryOf(query, actorId), hiddenKeys: hiddenKeysOf(query), columnKeys: columnKeysOf(query) };
}

function hiddenKeysOf(query: unknown): readonly string[] {
  if (!isRecord(query)) return [];
  return list(query.hide) ?? [];
}

function columnKeysOf(query: unknown): readonly string[] {
  if (!isRecord(query)) return [];
  return list(query.columns) ?? [];
}

function withoutPage(query: unknown): Record<string, unknown> {
  if (!isRecord(query)) return {};
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'page' && key !== 'pageSize') next[key] = value;
  }
  return next;
}

function buyerOf(buyer: string | undefined, actorId: string): LinesQuery['buyer'] {
  if (buyer === undefined) return undefined;
  if (buyer === 'me') return { kind: 'user', userId: actorId };
  if (buyer === 'unassigned') return { kind: 'unassigned' };
  return { kind: 'user', userId: buyer };
}

function defined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter((entry) => entry[1] !== undefined));
}

function text(value: unknown): string | undefined {
  const first = firstOf(value);
  return typeof first === 'string' && first !== '' ? first : undefined;
}

function numberOf(value: unknown): number | string | undefined {
  const first = firstOf(value);
  if (first === undefined || first === '') return undefined;
  if (typeof first === 'number') return first;
  if (typeof first === 'string' && first.trim() !== '' && !Number.isNaN(Number(first))) return Number(first);
  return typeof first === 'string' ? first : undefined;
}

function flag(value: unknown): boolean | string | undefined {
  const first = firstOf(value);
  if (first === undefined || first === '') return undefined;
  if (typeof first === 'boolean') return first;
  if (first === 'true') return true;
  if (first === 'false') return false;
  return typeof first === 'string' ? first : undefined;
}

function list(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item !== '');
  if (typeof value !== 'string' || value === '') return undefined;
  return value.split(',').filter((item) => item !== '');
}

function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}
