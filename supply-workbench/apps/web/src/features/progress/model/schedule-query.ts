import { parseLocalDate, type LocalDate } from '@sw/domain';
import { isWorkItemStatus, type WorkItemStatus } from '../../today/index.js';

export type ScheduleScale = 'week' | 'month';

export type ScheduleFilters = {
  readonly ownerUserId: string | null;
  readonly supplierPartyId: string | null;
  readonly factoryPartyId: string | null;
  readonly status: WorkItemStatus | null;
};

export type ScheduleQuery = {
  readonly scale: ScheduleScale;
  readonly anchor: LocalDate;
  readonly filters: ScheduleFilters;
};

const EMPTY_FILTERS: ScheduleFilters = { ownerUserId: null, supplierPartyId: null, factoryPartyId: null, status: null };

export function emptyScheduleFilters(): ScheduleFilters {
  return EMPTY_FILTERS;
}

export function readScheduleQuery(search: string, today: LocalDate): ScheduleQuery {
  const params = new URLSearchParams(search);
  return {
    scale: params.get('scale') === 'month' ? 'month' : 'week',
    anchor: dateOf(params.get('from')) ?? today,
    filters: {
      ownerUserId: params.get('ownerUserId'),
      supplierPartyId: params.get('supplierPartyId'),
      factoryPartyId: params.get('factoryPartyId'),
      status: statusOf(params.get('status')),
    },
  };
}

export function writeScheduleQuery(input: { readonly search: string; readonly query: ScheduleQuery }): string {
  const params = new URLSearchParams(input.search);
  params.set('view', 'schedule');
  params.set('scale', input.query.scale);
  params.set('from', input.query.anchor);
  writeFilter({ params, key: 'ownerUserId', value: input.query.filters.ownerUserId });
  writeFilter({ params, key: 'supplierPartyId', value: input.query.filters.supplierPartyId });
  writeFilter({ params, key: 'factoryPartyId', value: input.query.filters.factoryPartyId });
  writeFilter({ params, key: 'status', value: input.query.filters.status });
  return params.toString();
}

function statusOf(value: string | null): WorkItemStatus | null {
  return value !== null && isWorkItemStatus(value) ? value : null;
}

function dateOf(value: string | null): LocalDate | null {
  if (value === null) return null;
  const parsed = parseLocalDate(value);
  return parsed.ok ? parsed.value : null;
}

function writeFilter(input: { readonly params: URLSearchParams; readonly key: string; readonly value: string | null }): void {
  if (input.value === null) input.params.delete(input.key);
  else input.params.set(input.key, input.value);
}
