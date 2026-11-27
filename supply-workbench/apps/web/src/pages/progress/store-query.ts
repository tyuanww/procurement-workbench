import { ProcurementStoreSchema, type ProcurementStore } from '@sw/contracts';
import { PAGE_SIZE_OPTIONS } from '../../shared/ui/pagination.js';

type ProgressPagination = { readonly page: number; readonly pageSize: number };

export function progressPagination(params: URLSearchParams): ProgressPagination {
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : 50,
  };
}

export function resetProgressPagination(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('page');
  next.delete('focusLine');
  next.delete('openLine');
  return next;
}

export function withProgressPagination(params: URLSearchParams, { page, pageSize }: ProgressPagination): URLSearchParams {
  const next = resetProgressPagination(params);
  if (page > 1) next.set('page', String(page));
  if (pageSize === 50) next.delete('pageSize');
  else next.set('pageSize', String(pageSize));
  return next;
}

export const storeLabels = {
  all: '全部店铺',
  dafuyan: '达肤妍',
  yiling: '译龄',
  unassigned: '未分店铺',
} satisfies Record<ProcurementStore, string>;

export function progressStoreOf(value: string | null): ProcurementStore {
  return ProcurementStoreSchema.safeParse(value).data ?? 'all';
}

export function withProgressStore(search: string, store: ProcurementStore): URLSearchParams {
  const params = resetProgressPagination(new URLSearchParams(search));
  if (store === 'all') params.delete('store');
  else params.set('store', store);
  for (const key of ['drawer', 'oa', 'scheduleLine', 'ownerUserId', 'supplierPartyId', 'factoryPartyId', 'status', 'developmentProject', 'developmentNode']) params.delete(key);
  return params;
}

export function withProgressScope(search: string, isMine: boolean): URLSearchParams {
  const params = resetProgressPagination(new URLSearchParams(search));
  if (isMine) params.set('scope', 'mine');
  else params.delete('scope');
  params.delete('oa');
  return params;
}
