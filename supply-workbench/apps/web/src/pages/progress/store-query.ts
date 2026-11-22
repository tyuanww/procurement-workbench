import { ProcurementStoreSchema, type ProcurementStore } from '@sw/contracts';

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
  const params = new URLSearchParams(search);
  if (store === 'all') params.delete('store');
  else params.set('store', store);
  for (const key of ['drawer', 'oa', 'scheduleLine', 'ownerUserId', 'supplierPartyId', 'factoryPartyId', 'status', 'developmentProject', 'developmentNode']) params.delete(key);
  return params;
}

export function withProgressScope(search: string, isMine: boolean): URLSearchParams {
  const params = new URLSearchParams(search);
  if (isMine) params.set('scope', 'mine');
  else params.delete('scope');
  params.delete('oa');
  return params;
}
