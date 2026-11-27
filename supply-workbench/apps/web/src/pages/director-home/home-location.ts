import type { ProcurementStore } from '@sw/contracts';
import { meetingStoreLabels } from '../../features/reporting/index.js';
import type { BrandScope } from './project-register.js';
import { initialFilter, SIGNALS, VIEWS, type WorkFilter } from './work-register.js';

type SortColumn = 'product' | 'owner' | 'date';
export type WorkSort = { readonly column: SortColumn; readonly order: 'ascend' | 'descend' };
export type HomeWorkLocation = {
  readonly scope: BrandScope;
  readonly filter: WorkFilter;
  readonly sort: WorkSort | null;
  readonly page: number;
  readonly isSearchOpen: boolean;
  readonly drawer: 'risk' | null;
};

export const initialHomeWork: HomeWorkLocation = {
  scope: 'all', filter: initialFilter, sort: null, page: 1, isSearchOpen: false, drawer: null,
};

const STORE_SCOPES = {
  all: 'all', unassigned: 'unassigned', dafuyan: `brand:${meetingStoreLabels.dafuyan}`, yiling: `brand:${meetingStoreLabels.yiling}`,
} as const satisfies Record<ProcurementStore, BrandScope>;

export function homeRiskStore(scope: BrandScope): ProcurementStore | null {
  if (scope === STORE_SCOPES.dafuyan) return 'dafuyan';
  if (scope === STORE_SCOPES.yiling) return 'yiling';
  return scope === 'all' ? 'all' : null;
}

export function homeScopeLabel(scope: BrandScope): string {
  if (scope === 'all') return '全部店铺';
  if (scope === 'unassigned') return meetingStoreLabels.unassigned;
  return scope.slice('brand:'.length);
}

function scopeOf(value: string | null): BrandScope {
  if (value === 'dafuyan' || value === 'yiling' || value === 'unassigned') return STORE_SCOPES[value];
  return isBrandScope(value) ? value : 'all';
}

function isBrandScope(value: string | null): value is `brand:${string}` {
  return value !== null && value.startsWith('brand:') && value.length > 'brand:'.length;
}

function keyOf<T extends object>(options: T, value: string | null): (keyof T & string) | undefined {
  return Object.keys(options).find((key): key is keyof T & string => key === value);
}

export function workSortOf(column: unknown, order: unknown): WorkSort | null {
  return (column === 'product' || column === 'owner' || column === 'date') && (order === 'ascend' || order === 'descend')
    ? { column, order } : null;
}

export function readHomeWork(params: URLSearchParams): HomeWorkLocation {
  const search = params.get('q') ?? '';
  const page = Number(params.get('page'));
  return {
    scope: scopeOf(params.get('store')),
    filter: { view: keyOf(VIEWS, params.get('view')) ?? initialFilter.view, owner: params.get('owner') ?? undefined,
      signal: keyOf(SIGNALS, params.get('signal')), search },
    sort: workSortOf(params.get('sort'), params.get('order')),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    isSearchOpen: search !== '' || params.get('search') === 'open',
    drawer: params.get('drawer') === 'risk' ? 'risk' : null,
  };
}

export function homeWorkParams(location: HomeWorkLocation): URLSearchParams {
  const { scope, filter, sort, page, isSearchOpen, drawer } = location;
  const params = new URLSearchParams();
  if (scope !== 'all') params.set('store', homeRiskStore(scope) ?? scope);
  writeWorkFilters(params, { filter, isSearchOpen });
  if (sort !== null) {
    params.set('sort', sort.column);
    params.set('order', sort.order);
  }
  if (page !== 1) params.set('page', String(page));
  if (drawer !== null) params.set('drawer', drawer);
  return params;
}

function writeWorkFilters(params: URLSearchParams, { filter, isSearchOpen }: Pick<HomeWorkLocation, 'filter' | 'isSearchOpen'>): void {
  if (filter.view !== initialFilter.view) params.set('view', filter.view);
  if (filter.owner !== undefined) params.set('owner', filter.owner);
  if (filter.signal !== undefined) params.set('signal', filter.signal);
  if (filter.search !== '') params.set('q', filter.search);
  else if (isSearchOpen) params.set('search', 'open');
}

export const HOME_RISK_RETURN_PARAM = 'backToHome';
export const HOME_RISK_GROUP_FOCUS = 'home-risk:group';

export function homeRiskLineFocus(lineId: string, batchId: string | null): string {
  return JSON.stringify(['home-risk', lineId, batchId]);
}

export function homeAddress(params: URLSearchParams): string {
  return params.size === 0 ? '/home' : `/home?${params}`;
}

export function homeRiskBackAddress(search: string | null): string | null {
  if (search === null) return null;
  const home = readHomeWork(new URLSearchParams(search));
  return home.drawer === 'risk' ? homeAddress(homeWorkParams(home)) : null;
}
